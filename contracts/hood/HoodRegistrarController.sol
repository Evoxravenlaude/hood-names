// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import {BaseRegistrarImplementation} from "../ethregistrar/BaseRegistrarImplementation.sol";
import {IPriceOracle} from "../ethregistrar/IPriceOracle.sol";
import {Resolver} from "../resolvers/Resolver.sol";
import {ENS} from "../registry/ENS.sol";
import {IReverseRegistrar} from "../reverseRegistrar/IReverseRegistrar.sol";

import {PaymentAcceptor} from "./PaymentAcceptor.sol";
import {IHoodPriceOracle} from "./IHoodPriceOracle.sol";
import {IHoodRegistrarController} from "./IHoodRegistrarController.sol";
import {HoodReferralHub} from "./HoodReferralHub.sol";
import {HoodPointsLedger} from "./HoodPointsLedger.sol";
import {HoodBaseRegistrar} from "./HoodBaseRegistrar.sol";
import {HoodNameGuard} from "./HoodNameGuard.sol";
import {HoodResolverPolicy} from "./HoodResolverPolicy.sol";
import {INameWrapper} from "../wrapper/INameWrapper.sol";
import {ResolverBase} from "../resolvers/ResolverBase.sol";

/// @dev The ENS IETHRegistrarController surface, which this contract also
///      implements, declared here so its ERC-165 id can be advertised.
interface IETHRegistrarControllerCompat {
    function rentPrice(
        string memory label,
        uint256 duration
    ) external view returns (IPriceOracle.Price memory);

    function available(string memory label) external returns (bool);

    function makeCommitment(
        IHoodRegistrarController.Registration memory registration
    ) external pure returns (bytes32 commitment);

    function commit(bytes32 commitment) external;

    function register(
        IHoodRegistrarController.Registration memory registration
    ) external payable;

    function renew(
        string calldata label,
        uint256 duration,
        bytes32 referrer
    ) external payable;
}

/// @notice Decides whether a registration qualifies for a discount, and
///         marks whatever makes it one-time (a pass, an account) as used.
///         Called only by the controller.
interface IDiscountValidator {
    /// @param claimer The address the name is being registered to.
    /// @param sender Who is submitting the registration.
    /// @param commitment Hash of the full registration, so a proof can be
    ///        bound to one specific name and cannot be spent on another.
    /// @param key The discount being claimed, so a proof issued for one
    ///        programme cannot be spent on another that shares a validator.
    function validateAndConsume(
        address claimer,
        address sender,
        bytes32 commitment,
        bytes32 key,
        bytes calldata validationData
    ) external returns (bool);
}

/// @notice Sanctions oracle interface (Chainalysis-compatible).
interface ISanctionsList {
    function isSanctioned(address addr) external view returns (bool);
}

/// @title HoodRegistrarController
/// @notice Registers and renews names directly under the parent name the
///         base registrar owns, using the ENS commit-reveal flow.
///         The parent ("hood", or an ENS name such as "names.example.eth") is
///         chosen at deployment.
///
/// Derived from the ENS ETHRegistrarController. `commit`, `register`, `renew`,
/// the Registration struct and the NameRegistered / NameRenewed events keep
/// the ENS shape. Added on top:
///  - payment in ETH or an accepted USD stablecoin (for example USDG);
///  - gift-card points that offset the price;
///  - referral commission and buyer discount through HoodReferralHub;
///  - name rules, reserved names and lookalike checks, held in HoodNameGuard
///    so they survive a change of controller;
///  - the contract starts paused, and commitments are refused while paused,
///    so nothing can be registered or queued before the reserved list is in.
contract HoodRegistrarController is
    PaymentAcceptor,
    ReentrancyGuard,
    ERC165,
    IHoodRegistrarController
{
    using SafeERC20 for IERC20;

    /// @notice Bit of `Registration.reverseRecord` that sets the caller's primary name.
    uint8 public constant REVERSE_RECORD_BIT = 1;

    /// @notice The minimum duration for a registration.
    uint256 public constant MIN_REGISTRATION_DURATION = 28 days;

    /// @notice While paused, a renewal cannot push expiry further out than this.
    uint256 public constant MAX_PAUSED_RENEWAL_HORIZON = 365 days;

    /// @notice Furthest ahead a name's expiry can be pushed by a
    ///         registration or a renewal.
    uint256 public constant MAX_REGISTRATION_HORIZON = 3650 days;

    /// @notice Decides which labels may be registered: well-formed, not
    ///         reserved, and not a lookalike of a live name.
    HoodNameGuard public immutable guard;

    /// @notice Longest registration a discount can be applied to.
    uint256 public constant MAX_DISCOUNT_DURATION = 365 days;

    struct Discount {
        bool active;
        address validator;
        uint16 discountBps; // 10000 = free
        uint8 minLabelLength; // shortest label the discount applies to
    }

    /// @notice Namehash of the parent name, and the suffix shown after a label.
    bytes32 public immutable baseNode;
    string public nameSuffix;

    /// @notice Discounts by key, for example a free first name for accounts
    ///         with a verification attestation.
    mapping(bytes32 => Discount) public discounts;
    /// @notice Addresses that have already used a discount. One per address.
    mapping(address => bool) public discountedRegistrants;

    /// @notice Sanctions oracle, or zero to skip screening.
    ISanctionsList public sanctionsList;

    ENS public immutable ens;
    BaseRegistrarImplementation public immutable base;
    uint256 public immutable minCommitmentAge;
    uint256 public immutable maxCommitmentAge;
    IReverseRegistrar public immutable reverseRegistrar;

    /// @notice The price oracle. Replaceable by the owner.
    IHoodPriceOracle public prices;
    /// @notice Referral hub, or zero to disable referrals.
    HoodReferralHub public referralHub;
    /// @notice Points ledger, or zero to disable points.
    HoodPointsLedger public pointsLedger;

    /// @notice Name wrapper, or zero. Renewals go through it so that a
    ///         wrapped name's expiry is extended in the wrapper as well.
    INameWrapper public nameWrapper;

    mapping(bytes32 => uint256) public commitments;

    error CommitmentNotFound(bytes32 commitment);
    error CommitmentTooNew(
        bytes32 commitment,
        uint256 minimumCommitmentTimestamp,
        uint256 currentTimestamp
    );
    error CommitmentTooOld(
        bytes32 commitment,
        uint256 maximumCommitmentTimestamp,
        uint256 currentTimestamp
    );
    error DurationTooShort(uint256 duration);
    error ResolverRequiredWhenDataSupplied();
    error ResolverRequiredForReverseRecord();
    error UnexpiredCommitmentExists(bytes32 commitment);
    error InsufficientValue();
    error UnexpectedValue();
    error MaxTokenAmountExceeded(uint256 due, uint256 maxTokenAmount);
    error MaxCommitmentAgeTooLow();
    error MaxCommitmentAgeTooHigh();
    error UnknownReverseRecordBits(uint8 reverseRecord);
    error RenewalTooLongWhilePaused();
    error DurationTooLong(uint256 duration);
    error InvalidOwner(address owner);
    error ReverseRecordNotForOwner();
    error ShortTransfer(uint256 received, uint256 due);
    error InvalidDiscount(bytes32 key);
    error DiscountAlreadyUsed(address claimer);
    error DiscountDurationTooLong(uint256 duration);
    error Sanctioned(address account);

    /// @dev Same shape as ENS. `baseCost` and `premium` are the list price in
    ///      wei at the current rate, whatever currency was actually used;
    ///      PaymentSettled carries what was really paid.
    event NameRegistered(
        string label,
        bytes32 indexed labelhash,
        address indexed owner,
        uint256 baseCost,
        uint256 premium,
        uint256 expires,
        bytes32 referrer
    );

    /// @dev Same shape as ENS; `cost` follows the same convention as above.
    event NameRenewed(
        string label,
        bytes32 indexed labelhash,
        uint256 cost,
        uint256 expires,
        bytes32 referrer
    );

    /// @notice What a registration or renewal actually cost the payer.
    /// @param token Payment currency (address(0) = ETH).
    /// @param amountPaid Amount charged to the payer, in `token`.
    /// @param pointsUsed Points spent, in USD (18 decimals).
    /// @param referrerPayee Address credited with commission, or zero.
    /// @param referrerFee Commission sent to the referral hub, in `token`.
    /// @param refereeDiscount Discount given to the payer, in `token`.
    event PaymentSettled(
        bytes32 indexed labelhash,
        address indexed payer,
        address indexed token,
        uint256 amountPaid,
        uint256 pointsUsed,
        address referrerPayee,
        uint256 referrerFee,
        uint256 refereeDiscount
    );

    event PriceOracleChanged(address prices);
    event ReferralHubChanged(address referralHub);
    event PointsLedgerChanged(address pointsLedger);
    event NameWrapperChanged(address nameWrapper);
    event DiscountChanged(
        bytes32 indexed key,
        bool active,
        address validator,
        uint16 discountBps
    );
    event DiscountApplied(
        bytes32 indexed labelhash,
        address indexed claimer,
        bytes32 indexed key
    );
    event SanctionsListChanged(address sanctionsList);

    constructor(
        BaseRegistrarImplementation _base,
        IHoodPriceOracle _prices,
        uint256 _minCommitmentAge,
        uint256 _maxCommitmentAge,
        IReverseRegistrar _reverseRegistrar,
        ENS _ens,
        HoodReferralHub _referralHub,
        HoodPointsLedger _pointsLedger,
        string memory _nameSuffix,
        HoodNameGuard _guard
    ) {
        guard = _guard;
        // Closed until the owner opens it, so there is no moment after
        // deployment at which a name can be taken before the reserved list
        // has been loaded.
        paused = true;
        baseNode = _base.baseNode();
        nameSuffix = _nameSuffix;
        if (_maxCommitmentAge <= _minCommitmentAge)
            revert MaxCommitmentAgeTooLow();
        if (_maxCommitmentAge > block.timestamp)
            revert MaxCommitmentAgeTooHigh();

        ens = _ens;
        base = _base;
        prices = _prices;
        minCommitmentAge = _minCommitmentAge;
        maxCommitmentAge = _maxCommitmentAge;
        reverseRegistrar = _reverseRegistrar;
        referralHub = _referralHub;
        pointsLedger = _pointsLedger;
    }

    /* Admin */

    function setPriceOracle(IHoodPriceOracle _prices) external onlyOwner {
        prices = _prices;
        emit PriceOracleChanged(address(_prices));
    }

    function setReferralHub(HoodReferralHub _referralHub) external onlyOwner {
        referralHub = _referralHub;
        emit ReferralHubChanged(address(_referralHub));
    }

    /// @dev This contract must also be a controller on the wrapper.
    function setNameWrapper(INameWrapper _nameWrapper) external onlyOwner {
        nameWrapper = _nameWrapper;
        emit NameWrapperChanged(address(_nameWrapper));
    }

    /// @param minLabelLength Shortest label the discount applies to, so a
    ///        free-name programme cannot be used to take premium short names.
    function setDiscount(
        bytes32 key,
        bool active,
        address validator,
        uint16 discountBps,
        uint8 minLabelLength
    ) external onlyOwner {
        if (
            discountBps > 10_000 ||
            (active && (validator == address(0) || discountBps == 0))
        ) revert InvalidDiscount(key);
        discounts[key] = Discount(active, validator, discountBps, minLabelLength);
        emit DiscountChanged(key, active, validator, discountBps);
    }

    function setSanctionsList(ISanctionsList _sanctionsList) external onlyOwner {
        sanctionsList = _sanctionsList;
        emit SanctionsListChanged(address(_sanctionsList));
    }

    /// @notice Issues a reserved name to its rightful holder, for example a
    ///         brand that has shown it owns the mark. No commitment or
    ///         payment; the name stays on the reserved list so that it cannot
    ///         be taken by the public if it later expires.
    function registerReserved(
        Registration calldata registration
    ) external onlyOwner nonReentrant {
        bytes32 labelhash = keccak256(bytes(registration.label));
        guard.admit(registration.label, labelhash, true);
        if (registration.reverseRecord != 0)
            revert UnknownReverseRecordBits(registration.reverseRecord);
        if (registration.duration < MIN_REGISTRATION_DURATION)
            revert DurationTooShort(registration.duration);
        _checkTerms(registration.owner, registration.duration);

        uint256 expires = _issue(registration, labelhash);
        emit NameRegistered(
            registration.label,
            labelhash,
            registration.owner,
            0,
            0,
            expires,
            bytes32(0)
        );
    }

    function setPointsLedger(HoodPointsLedger _pointsLedger) external onlyOwner {
        pointsLedger = _pointsLedger;
        emit PointsLedgerChanged(address(_pointsLedger));
    }

    /* Views */

    /// @notice List price of a registration in wei (rent plus any release
    ///         premium). A name is priced on the shortest name that looks
    ///         like it, so spelling a short name with wider characters does
    ///         not make it cheaper.
    function rentPrice(
        string calldata label,
        uint256 duration
    ) public view override returns (IPriceOracle.Price memory price) {
        (uint256 length, uint256 premiumExpiry) = guard.pricing(label);
        price = prices.priceForLength(length, premiumExpiry, duration);
    }

    /// @notice True if the label is well-formed under the name rules.
    function valid(string calldata label) public view returns (bool) {
        return guard.valid(label);
    }

    /// @notice True if the label is well-formed, not reserved, not currently
    ///         registered, and does not look like a name that is.
    function available(string calldata label) public view override returns (bool) {
        return guard.available(label);
    }

    /// @notice The commitment hash for a registration.
    function makeCommitment(
        Registration calldata registration
    ) public pure override returns (bytes32 commitment) {
        if (registration.data.length > 0 && registration.resolver == address(0))
            revert ResolverRequiredWhenDataSupplied();

        if (
            registration.reverseRecord != 0 &&
            registration.resolver == address(0)
        ) revert ResolverRequiredForReverseRecord();

        if (registration.reverseRecord & ~REVERSE_RECORD_BIT != 0)
            revert UnknownReverseRecordBits(registration.reverseRecord);

        if (registration.duration < MIN_REGISTRATION_DURATION)
            revert DurationTooShort(registration.duration);

        return keccak256(abi.encode(registration));
    }

    /// @notice What a registration would cost `payer` right now.
    function quoteRegistration(
        string calldata label,
        address nameOwner,
        uint256 duration,
        bytes32 referrer,
        address payer,
        Payment calldata payment
    ) external view override returns (Quote memory quote) {
        bytes32 labelhash = keccak256(bytes(label));
        (uint256 usdBase, uint256 usdPremium) = _listPriceUSD(label, duration);
        quote = _quote(
            usdBase,
            usdPremium,
            payment,
            referrer == labelhash ? bytes32(0) : referrer,
            payer,
            nameOwner
        );
    }

    /// @notice What a renewal would cost `payer` right now.
    function quoteRenewal(
        string calldata label,
        uint256 duration,
        address payer,
        Payment calldata payment
    ) external view override returns (Quote memory quote) {
        (uint256 length, ) = guard.pricing(label);
        (uint256 usdBase, ) = prices.priceUSDForLength(length, 0, duration);
        quote = _quote(usdBase, 0, payment, bytes32(0), payer, address(0));
    }

    /* Commit */

    /// @dev Refused while paused, so that nobody can queue a registration
    ///      before launch and land it the moment sales open.
    function commit(bytes32 commitment) public override whenNotPaused {
        if (commitments[commitment] + maxCommitmentAge >= block.timestamp) {
            revert UnexpiredCommitmentExists(commitment);
        }
        commitments[commitment] = block.timestamp;
    }

    /* Register */

    /// @notice Registers a name, paying in ETH. Same call shape as ENS.
    /// @dev Pausing stops new registrations. Records, transfers and
    ///      resolution keep working, and renewals stay open so nobody loses
    ///      a name because of an incident, but they are capped at one year
    ///      ahead while paused.
    function register(
        Registration calldata registration
    ) external payable override nonReentrant whenNotPaused {
        _register(registration, Payment(address(0), false, 0), 0);
    }

    /// @notice Registers a name, choosing the currency and whether to spend points.
    function registerWithPayment(
        Registration calldata registration,
        Payment calldata payment
    ) external payable override nonReentrant whenNotPaused {
        _register(registration, payment, 0);
    }

    /// @notice Registers a name at a discount its owner qualifies for. One
    ///         discounted name per address, for up to a year.
    ///
    /// The validator decides who may submit. A proof is bound to the exact
    /// registration, so nobody can spend another person's discount on a name
    /// that person did not choose.
    /// @param key The discount to claim.
    /// @param validationData Whatever proof the discount's validator needs.
    function registerWithDiscount(
        Registration calldata registration,
        Payment calldata payment,
        bytes32 key,
        bytes calldata validationData
    ) external payable nonReentrant whenNotPaused {
        Discount memory discount = discounts[key];
        if (!discount.active) revert InvalidDiscount(key);
        if (registration.duration > MAX_DISCOUNT_DURATION)
            revert DiscountDurationTooLong(registration.duration);
        {
            // Judged on the priced length, so a short name spelled with
            // wider characters does not qualify.
            (uint256 length, ) = guard.pricing(registration.label);
            if (length < discount.minLabelLength) revert InvalidDiscount(key);
        }
        if (discountedRegistrants[registration.owner])
            revert DiscountAlreadyUsed(registration.owner);

        discountedRegistrants[registration.owner] = true;
        if (
            !IDiscountValidator(discount.validator).validateAndConsume(
                registration.owner,
                msg.sender,
                makeCommitment(registration),
                key,
                validationData
            )
        ) revert InvalidDiscount(key);

        emit DiscountApplied(
            keccak256(bytes(registration.label)),
            registration.owner,
            key
        );
        _register(registration, payment, discount.discountBps);
    }

    /* Renew */

    /// @notice Renews a name, paying in ETH. Same call shape as ENS.
    function renew(
        string calldata label,
        uint256 duration,
        bytes32 referrer
    ) external payable override nonReentrant {
        _renew(label, duration, referrer, Payment(address(0), false, 0));
    }

    /// @notice Renews a name, choosing the currency and whether to spend points.
    function renewWithPayment(
        string calldata label,
        uint256 duration,
        bytes32 referrer,
        Payment calldata payment
    ) external payable override nonReentrant {
        _renew(label, duration, referrer, payment);
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view override returns (bool) {
        return
            interfaceID == type(IHoodRegistrarController).interfaceId ||
            // The six functions shared with ENS have identical signatures.
            interfaceID == type(IETHRegistrarControllerCompat).interfaceId ||
            super.supportsInterface(interfaceID);
    }

    /* Internal */

    function _register(
        Registration calldata registration,
        Payment memory payment,
        uint16 discountBps
    ) internal {
        bytes32 labelhash = keccak256(bytes(registration.label));

        // Everything that decides the charge is fixed here, before the name
        // exists: the price (base.register() overwrites the old expiry that
        // the release premium depends on) and the referral (so a name cannot
        // act as its own referrer through records set during registration).
        // A discounted registration earns no referral on top.
        bytes32 referrer = (registration.referrer == labelhash ||
            discountBps != 0)
            ? bytes32(0)
            : registration.referrer;
        Quote memory quote = _admitAndQuote(
            registration,
            labelhash,
            referrer,
            payment,
            discountBps
        );

        uint256 expires = _issue(registration, labelhash);

        emit NameRegistered(
            registration.label,
            labelhash,
            registration.owner,
            _listPriceWei(quote.usdBase),
            _listPriceWei(quote.usdPremium),
            expires,
            registration.referrer
        );

        _settle(labelhash, quote, payment, referrer);
    }

    /// @dev Checks the name, the recipient and the commitment, takes the
    ///      name's skeleton, and prices the registration.
    function _admitAndQuote(
        Registration calldata registration,
        bytes32 labelhash,
        bytes32 referrer,
        Payment memory payment,
        uint16 discountBps
    ) internal returns (Quote memory) {
        (uint256 priceLength, uint256 premiumExpiry) = guard.admit(
            registration.label,
            labelhash,
            false
        );
        _checkTerms(registration.owner, registration.duration);
        // A primary name is set for the caller, so the caller must be the
        // one receiving the name.
        if (
            registration.reverseRecord != 0 && msg.sender != registration.owner
        ) revert ReverseRecordNotForOwner();
        _screen(registration.owner);
        if (msg.sender != registration.owner) _screen(msg.sender);

        _consumeCommitment(makeCommitment(registration));

        return
            _registrationQuote(
                registration,
                priceLength,
                premiumExpiry,
                referrer,
                payment,
                discountBps
            );
    }

    function _registrationQuote(
        Registration calldata registration,
        uint256 priceLength,
        uint256 premiumExpiry,
        bytes32 referrer,
        Payment memory payment,
        uint16 discountBps
    ) internal view returns (Quote memory) {
        (uint256 usdBase, uint256 usdPremium) = prices.priceUSDForLength(
            priceLength,
            premiumExpiry,
            registration.duration
        );
        // A discount lowers the rent, never the release premium.
        if (discountBps != 0)
            usdBase = (usdBase * (10_000 - discountBps)) / 10_000;
        return
            _quote(
                usdBase,
                usdPremium,
                payment,
                referrer,
                msg.sender,
                registration.owner
            );
    }

    /// @dev Issues the name and applies resolver, records and primary name.
    ///
    /// Unlike the ENS controller, this always passes the name through this
    /// contract so the registry entry is rewritten in full: owner, resolver
    /// (including "none") and TTL. A re-registered name therefore never keeps
    /// the previous owner's resolver pointer. The previous owner's records
    /// are already out of reach because HoodPublicResolver stores records
    /// per owner, and no contract chosen by the previous owner is called.
    function _issue(
        Registration calldata registration,
        bytes32 labelhash
    ) internal returns (uint256 expires) {
        uint256 tokenId = uint256(labelhash);
        bytes32 node = keccak256(abi.encodePacked(baseNode, labelhash));

        bool reRegistration = base.nameExpires(tokenId) != 0;
        expires = base.register(tokenId, address(this), registration.duration);

        ens.setRecord(node, registration.owner, registration.resolver, 0);

        if (reRegistration) {
            // A label registered afresh starts with a clean referral history.
            if (address(referralHub) != address(0))
                referralHub.resetReferrer(labelhash);

            // If the name is going back to an address that held it before,
            // that address's old records would otherwise return. Start it
            // clean, on the default resolver whichever resolver was chosen
            // (the owner may switch to it later) and on the chosen one if it
            // is trusted. Only trusted resolvers are called.
            address defaultResolver = guard.defaultResolver();
            if (defaultResolver != address(0)) _clear(defaultResolver, node);
            if (
                registration.resolver != defaultResolver &&
                _isTrustedResolver(registration.resolver)
            ) _clear(registration.resolver, node);
        }

        if (registration.data.length > 0)
            Resolver(registration.resolver).multicallWithNodeCheck(
                node,
                registration.data
            );

        base.transferFrom(address(this), registration.owner, tokenId);

        if (registration.reverseRecord & REVERSE_RECORD_BIT != 0)
            reverseRegistrar.setNameForAddr(
                msg.sender,
                msg.sender,
                registration.resolver,
                string.concat(registration.label, nameSuffix)
            );
    }

    function _renew(
        string calldata label,
        uint256 duration,
        bytes32 referrer,
        Payment memory payment
    ) internal {
        bytes32 labelhash = keccak256(bytes(label));
        uint256 tokenId = uint256(labelhash);

        (uint256 priceLength, ) = guard.pricing(label);
        (uint256 usdBase, ) = prices.priceUSDForLength(priceLength, 0, duration);

        // Through the wrapper when there is one: it renews on the registrar
        // and, for a wrapped name, extends the wrapper's own expiry. Renewing
        // on the registrar alone would leave a wrapped name to die at its
        // old expiry.
        uint256 expires = address(nameWrapper) != address(0)
            ? nameWrapper.renew(tokenId, duration)
            : base.renew(tokenId, duration);

        if (expires > block.timestamp + MAX_REGISTRATION_HORIZON)
            revert DurationTooLong(duration);

        // While paused (for example because prices are in doubt) a renewal
        // may keep a name alive but not buy years of extra time.
        if (paused && expires > block.timestamp + MAX_PAUSED_RENEWAL_HORIZON)
            revert RenewalTooLongWhilePaused();

        emit NameRenewed(
            label,
            labelhash,
            _listPriceWei(usdBase),
            expires,
            referrer
        );

        // Renewals carry the referrer in the event only; commission is paid
        // on new registrations.
        _settle(
            labelhash,
            _quote(usdBase, 0, payment, bytes32(0), msg.sender, address(0)),
            payment,
            bytes32(0)
        );
    }

    function _listPriceUSD(
        string calldata label,
        uint256 duration
    ) internal view returns (uint256 usdBase, uint256 usdPremium) {
        (uint256 length, uint256 premiumExpiry) = guard.pricing(label);
        return prices.priceUSDForLength(length, premiumExpiry, duration);
    }

    /// @dev A name cannot be issued to nobody, to this contract, or to a
    ///      registrar controller (which the registrar treats as a transit
    ///      address and would leave without a registry owner), nor for longer
    ///      than the horizon.
    function _checkTerms(address nameOwner, uint256 duration) internal view {
        if (
            nameOwner == address(0) ||
            nameOwner == address(this) ||
            base.controllers(nameOwner)
        ) revert InvalidOwner(nameOwner);
        if (duration > MAX_REGISTRATION_HORIZON) revert DurationTooLong(duration);
    }

    /// @dev Best effort: a trusted resolver that does not recognise this
    ///      controller must not be able to block registrations.
    function _clear(address resolver, bytes32 node) internal {
        try ResolverBase(resolver).clearRecords(node) {} catch {}
    }

    function _screen(address account) internal view {
        ISanctionsList list = sanctionsList;
        if (address(list) != address(0) && list.isSanctioned(account))
            revert Sanctioned(account);
    }

    function _isTrustedResolver(address resolver) internal view returns (bool) {
        if (resolver == address(0)) return false;
        try HoodBaseRegistrar(address(base)).policy() returns (
            HoodResolverPolicy policy
        ) {
            return
                address(policy) != address(0) &&
                policy.trustedResolvers(resolver);
        } catch {
            return false;
        }
    }

    /// @dev List price in wei for the ENS-shaped events. Informational only,
    ///      so a feed outage reports zero instead of blocking a stablecoin
    ///      or points payment that needs no ETH rate.
    function _listPriceWei(uint256 usdAmount) internal view returns (uint256) {
        try prices.usdToWei(usdAmount) returns (uint256 amount) {
            return amount;
        } catch {
            return 0;
        }
    }

    function _consumeCommitment(bytes32 commitment) internal {
        uint256 commitmentTimestamp = commitments[commitment];

        if (commitmentTimestamp + minCommitmentAge > block.timestamp)
            revert CommitmentTooNew(
                commitment,
                commitmentTimestamp + minCommitmentAge,
                block.timestamp
            );

        if (commitmentTimestamp + maxCommitmentAge <= block.timestamp) {
            if (commitmentTimestamp == 0) revert CommitmentNotFound(commitment);
            revert CommitmentTooOld(
                commitment,
                commitmentTimestamp + maxCommitmentAge,
                block.timestamp
            );
        }

        delete commitments[commitment];
    }

    /// @dev Works out who pays what. Pure accounting, no state changes.
    function _quote(
        uint256 usdBase,
        uint256 usdPremium,
        Payment memory payment,
        bytes32 referrer,
        address payer,
        address nameOwner
    ) internal view returns (Quote memory quote) {
        quote.usdBase = usdBase;
        quote.usdPremium = usdPremium;
        uint256 usdDue = usdBase + usdPremium;

        if (payment.usePoints && address(pointsLedger) != address(0)) {
            uint256 balance = pointsLedger.balanceOf(payer);
            quote.pointsUsed = balance < usdDue ? balance : usdDue;
            usdDue -= quote.pointsUsed;
        }

        // Nothing due means nothing to convert, so a purchase covered in
        // full by points does not depend on the ETH rate being available.
        uint256 gross = usdDue == 0
            ? 0
            : (
                payment.token == address(0)
                    ? prices.usdToWei(usdDue)
                    : _usdToToken(payment.token, usdDue)
            );

        if (referrer != bytes32(0) && address(referralHub) != address(0)) {
            address payee = guard.referrerPayee(referrer);
            // No commission for referring yourself.
            if (payee != address(0) && payee != payer && payee != nameOwner) {
                (uint16 referrerBps, uint16 refereeBps) = referralHub.rates(
                    referrer
                );
                // Commission and discount apply to rent only, never to the
                // release premium. Points are counted against the premium
                // first, so what is left of the rent is the smaller of the
                // amount due and the rent.
                uint256 usdRent = usdDue < usdBase ? usdDue : usdBase;
                uint256 rent = usdRent == usdDue
                    ? gross
                    : (
                        payment.token == address(0)
                            ? prices.usdToWei(usdRent)
                            : _usdToToken(payment.token, usdRent)
                    );
                if (rent > gross) rent = gross;
                quote.referrerPayee = payee;
                quote.usdCommissionable = usdRent;
                quote.referrerFee = (rent * referrerBps) / 10_000;
                quote.refereeDiscount = (rent * refereeBps) / 10_000;
            }
        }

        quote.amountDue = gross - quote.refereeDiscount;
    }

    /// @dev Collects payment, spends points, pays the referral hub and refunds
    ///      excess ETH. Runs after the name has been issued; the public entry
    ///      points are nonReentrant.
    function _settle(
        bytes32 labelhash,
        Quote memory quote,
        Payment memory payment,
        bytes32 referrer
    ) internal {
        if (quote.pointsUsed > 0)
            pointsLedger.deduct(msg.sender, quote.pointsUsed);

        bool isETH = payment.token == address(0);
        if (isETH) {
            if (msg.value < quote.amountDue) revert InsufficientValue();
        } else {
            if (msg.value != 0) revert UnexpectedValue();
            if (quote.amountDue > payment.maxTokenAmount)
                revert MaxTokenAmountExceeded(
                    quote.amountDue,
                    payment.maxTokenAmount
                );
            if (quote.amountDue != 0) {
                // The token must deliver what was charged; one that takes a
                // fee on transfer would leave the referral hub short.
                uint256 before = IERC20(payment.token).balanceOf(address(this));
                IERC20(payment.token).safeTransferFrom(
                    msg.sender,
                    address(this),
                    quote.amountDue
                );
                uint256 received = IERC20(payment.token).balanceOf(
                    address(this)
                ) - before;
                if (received < quote.amountDue)
                    revert ShortTransfer(received, quote.amountDue);
            }
        }

        if (quote.referrerPayee != address(0)) {
            if (isETH) {
                referralHub.record{value: quote.referrerFee}(
                    referrer,
                    quote.referrerPayee,
                    address(0),
                    quote.referrerFee,
                    quote.usdCommissionable
                );
            } else {
                if (quote.referrerFee > 0)
                    IERC20(payment.token).safeTransfer(
                        address(referralHub),
                        quote.referrerFee
                    );
                referralHub.record(
                    referrer,
                    quote.referrerPayee,
                    payment.token,
                    quote.referrerFee,
                    quote.usdCommissionable
                );
            }
        }

        emit PaymentSettled(
            labelhash,
            msg.sender,
            payment.token,
            quote.amountDue,
            quote.pointsUsed,
            quote.referrerPayee,
            quote.referrerFee,
            quote.refereeDiscount
        );

        if (isETH) _sendETH(msg.sender, msg.value - quote.amountDue);
    }
}
