import { parseAbi } from "viem";

const addr = (v: string | undefined) => (v ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const contracts = {
  factory: addr(process.env.NEXT_PUBLIC_FACTORY),
  registry: addr(process.env.NEXT_PUBLIC_REGISTRY),
  vault: addr(process.env.NEXT_PUBLIC_VAULT),
  quests: addr(process.env.NEXT_PUBLIC_QUESTS),
  profiles: addr(process.env.NEXT_PUBLIC_PROFILES),
  adapter: addr(process.env.NEXT_PUBLIC_ADAPTER)
};

export const factoryAbi = parseAbi([
  "struct RefundPolicy { uint8 remainder; uint8 cancelBefore; uint8 cancelAfter; uint8 rejected; uint8 noShow; uint64 refundCutoff; }",
  "struct EventConfig { address organizer; address token; bool tokenCreated; uint64 startTime; uint64 endTime; uint8 rewardMode; uint32 minCreditMinutes; uint8 methods; bool requireApproval; uint32 capacity; uint128 minHolding; uint128 burnAmount; string metadataCID; RefundPolicy policy; }",
  "struct CreateEventParams { address token; string name; string symbol; string metadataCID; uint64 startTime; uint64 endTime; uint8 rewardMode; uint32 minCreditMinutes; uint8 methods; bool requireApproval; uint32 capacity; uint128 minHolding; uint128 burnAmount; RefundPolicy policy; uint256 minTokensOut; bytes routeData; }",
  "function eventCount() view returns (uint256)",
  "function minInitialBuy() view returns (uint256)",
  "function getEvent(uint256 eventId) view returns (EventConfig)",
  "function getEvents(uint256 offset, uint256 limit) view returns (EventConfig[] page, uint256 total)",
  "function eventsByOrganizer(address organizer) view returns (uint256[])",
  "function eventsByToken(address token) view returns (uint256[])",
  "function tokenOf(uint256 eventId) view returns (address)",
  "function createEvent(CreateEventParams p) payable returns (uint256 eventId)",
  "function setMinCredit(uint256 eventId, uint32 minCreditMinutes)",
  "function setMetadata(uint256 eventId, string metadataCID)"
]);

export const registryAbi = parseAbi([
  "struct Guest { uint8 status; bool invited; uint128 deposit; uint64 checkInTime; uint64 checkOutTime; uint128 refundable; uint256 weight; }",
  "struct EventState { uint32 activeCount; uint32 waitlistHead; uint32 checkedIn; uint32 checkedOut; uint128 heldDeposits; uint256 totalWeight; bool settled; address kioskKey; address codeAddress; uint64 codeStart; uint64 codeEnd; }",
  "function guestOf(uint256 eventId, address guest) view returns (Guest)",
  "function stateOf(uint256 eventId) view returns (EventState)",
  "function checkedInCount(uint256 eventId) view returns (uint256)",
  "function waitlistLength(uint256 eventId) view returns (uint256)",
  "function rsvpCount(uint256 eventId) view returns (uint256)",
  "function rsvpAt(uint256 eventId, uint256 offset, uint256 limit) view returns (address[])",
  "function isStaff(uint256 eventId, address account) view returns (bool)",
  "function rsvp(uint256 eventId)",
  "function cancelRsvp(uint256 eventId)",
  "function withdrawDeposit(uint256 eventId)",
  "function claimNoShowRefund(uint256 eventId)",
  "function approve(uint256 eventId, address[] guests)",
  "function reject(uint256 eventId, address[] guests)",
  "function invite(uint256 eventId, address[] guests)",
  "function setStaff(uint256 eventId, address staff, bool enabled)",
  "function setKioskKey(uint256 eventId, address kioskKey)",
  "function revokeKioskKey(uint256 eventId)",
  "function setCodeAddress(uint256 eventId, address codeAddress, uint64 start, uint64 end)",
  "function checkIn(uint256 eventId, address guest)",
  "function checkInBatch(uint256 eventId, address[] guests)",
  "function checkOut(uint256 eventId, address guest)",
  "function checkInWithKiosk(uint256 eventId, uint64 windowId, bytes signature)",
  "function checkOutWithKiosk(uint256 eventId, uint64 windowId, bytes signature)",
  "function checkInWithCode(uint256 eventId, bytes signature)",
  "function settle(uint256 eventId)",
  "function KIOSK_WINDOW() view returns (uint64)"
]);

export const vaultAbi = parseAbi([
  "struct Pool { uint128 native; uint128 token; }",
  "struct EventPools { Pool checkIn; Pool checkInSnapshot; uint256 weightSnapshot; bool finalized; }",
  "function poolsOf(uint256 eventId) view returns (EventPools)",
  "function questPoolOf(uint256 eventId, uint256 questId) view returns (Pool)",
  "function previewClaim(uint256 eventId, address guest) view returns (uint256 nativeAmount, uint256 tokenAmount)",
  "function claimed(uint256 eventId, address guest) view returns (bool)",
  "function fundCheckIn(uint256 eventId, uint256 tokenAmount) payable",
  "function finalize(uint256 eventId)",
  "function claim(uint256 eventId)",
  "function claimQuest(uint256 eventId, uint256 questId)",
  "function withdrawLeftover(uint256 eventId)"
]);

export const questsAbi = parseAbi([
  "struct Quest { uint8 kind; uint128 param; string descriptionCID; uint64 deadline; uint256 completions; }",
  "function getQuests(uint256 eventId) view returns (Quest[])",
  "function hasCompleted(uint256 eventId, uint256 questId, address guest) view returns (bool)",
  "function createQuest(uint256 eventId, uint8 kind, uint128 param, string descriptionCID, uint64 deadline, uint256 tokenAmount) payable returns (uint256)",
  "function completeQuest(uint256 eventId, uint256 questId)",
  "function submitSocialProof(uint256 eventId, string link)",
  "function approveSocialQuest(uint256 eventId, uint256 questId, address[] guests)",
  "function markBooth(uint256 eventId, uint256 questId, address[] guests)",
  "function setReferrer(uint256 eventId, address referrer)"
]);

export const profilesAbi = parseAbi([
  "struct Profile { string name; string avatarCID; string telegram; uint64 updatedAt; }",
  "function profileOf(address account) view returns (Profile)",
  "function followerCount(address organizer) view returns (uint256)",
  "function isFollowing(address follower, address organizer) view returns (bool)",
  "function followingOf(address follower) view returns (address[])",
  "function setProfile(string name, string avatarCID, string telegram)",
  "function follow(address organizer)",
  "function unfollow(address organizer)"
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function symbol() view returns (string)",
  "function name() view returns (string)"
]);

export const adapterAbi = parseAbi(["function faucet(address token, uint256 amount)"]);

export const REWARD_MODE = ["By time at event", "Split equally"] as const;
export const DESTINATION = ["Refund", "Burn", "Reward pool"] as const;
export const GUEST_STATUS = ["None", "Pending", "Approved", "Waitlisted", "Rejected", "Cancelled"] as const;
export const QUEST_KIND = ["Hold token", "Stay minutes", "Invite checked-in friends", "Booth", "Social post"] as const;
export const METHOD = { STAFF: 1, KIOSK: 2, CODE: 4 } as const;
