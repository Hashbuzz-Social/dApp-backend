// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract HashbuzzLogicV1 is AccessControl {
  using SafeMath for uint256;

  // Define roles
  bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
  bytes32 public constant CAMPAIGNER_ROLE = keccak256("CAMPAIGNER_ROLE");

  // Define token types and campaign status
  enum TokenType {
    HBAR,
    Fungible,
    NonFungible
  }
  enum CampaignStatus {
    NotCreated,
    Active,
    Inactive,
    Expired
  }

  // Admin functionalities
  mapping(TokenType => address) public associatedTokens;

  // User Account Management
  struct UserBalance {
    mapping(TokenType => uint256) tokenBalances;
  }
  mapping(address => UserBalance) internal userBalances;

  // Campaign Management
  struct Campaign {
    address owner;
    CampaignStatus status;
    TokenType budgetType;
    uint256 budgetAmount;
    uint256 expiryDate;
  }
  mapping(uint256 => Campaign) public campaigns;

  // Emergency State
  bool public emergencyState;

  // Define events
  event TokenAssociated(TokenType tokenType, address tokenAddress);
  event CampaignApproved(uint256 campaignId);
  event CampaignRejected(uint256 campaignId);
  event AccountToppedUp(address indexed user, TokenType tokenType, uint256 amount);
  event CampaignCreated(address indexed user, uint256 campaignId, TokenType budgetType, uint256 budgetAmount);
  event EmergencyStateToggled(bool newState);

  // Constructor to set up roles
  constructor(address _proxyAdmin) {
    _setupRole(ADMIN_ROLE, _proxyAdmin);
  }

  // ------ Admin Functionalities ------

  function associateToken(TokenType _type, address _tokenAddress) public {
    require(hasRole(ADMIN_ROLE, msg.sender), "HashbuzzLogicV1: Only admin can associate tokens");
    associatedTokens[_type] = _tokenAddress;
    emit TokenAssociated(_type, _tokenAddress); // Emit event
  }

  function approveCampaign(uint256 _campaignId) public {
    require(hasRole(ADMIN_ROLE, msg.sender), "HashbuzzLogicV1: Only admin can approve campaigns");
    campaigns[_campaignId].status = CampaignStatus.Active;
    emit CampaignApproved(_campaignId); // Emit event
  }

  function rejectCampaign(uint256 _campaignId) public {
    require(hasRole(ADMIN_ROLE, msg.sender), "HashbuzzLogicV1: Only admin can reject campaigns");
    campaigns[_campaignId].status = CampaignStatus.Inactive;
    emit CampaignRejected(_campaignId); // Emit event
  }

  // Custom setter function to grant CAMPAIGNER_ROLE
  function grantUserRole(address account) public {
    require(hasRole(ADMIN_ROLE, msg.sender), "HashbuzzLogicV1: Only admin can grant a role");
    grantRole(CAMPAIGNER_ROLE, account);
  }

  // Custom setter function to revoke CAMPAIGNER_ROLE
  function revokeUserRole(address account) public {
    require(hasRole(ADMIN_ROLE, msg.sender), "HashbuzzLogicV1: Only admin can revoke a role");
    revokeRole(CAMPAIGNER_ROLE, account);
  }

  // ------ User Account Management ------

  function topUpAccount(TokenType _type, uint256 _amount) public {
    require(hasRole(CAMPAIGNER_ROLE, msg.sender), "HashbuzzLogicV1: Only users can top up accounts");
    userBalances[msg.sender].tokenBalances[_type] = userBalances[msg.sender].tokenBalances[_type].add(_amount);
    emit AccountToppedUp(msg.sender, _type, _amount); // Emit event
  }

  // ------ Campaign Management ------

  function createCampaign(TokenType _budgetType, uint256 _budgetAmount) public {
    require(hasRole(CAMPAIGNER_ROLE, msg.sender), "HashbuzzLogicV1: Only users can create campaigns");
    uint256 campaignId = uint256(keccak256(abi.encodePacked(msg.sender, _budgetType, _budgetAmount, block.timestamp)));
    Campaign memory newCampaign = Campaign({
      owner: msg.sender,
      status: CampaignStatus.NotCreated,
      budgetType: _budgetType,
      budgetAmount: _budgetAmount,
      expiryDate: 0
    });
    campaigns[campaignId] = newCampaign;
    emit CampaignCreated(msg.sender, campaignId, _budgetType, _budgetAmount); // Emit event
  }

  // ------ Emergency Fund Withdrawal and Balance Checks ------

  function toggleEmergencyState() public {
    require(hasRole(ADMIN_ROLE, msg.sender), "HashbuzzLogicV1: Only admin can toggle emergency state");
    emergencyState = !emergencyState;
    emit EmergencyStateToggled(emergencyState); // Emit event
  }

  function emergencyFundWithdrawal(address _to, uint256 _amount) public view {
    require(hasRole(ADMIN_ROLE, msg.sender), "HashbuzzLogicV1: Only admin can perform emergency withdrawal");
    require(emergencyState, "HashbuzzLogicV1: Cannot withdraw funds unless emergency state is active");
    // Implement the withdrawal logic here
  }
}
