// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

/**
 * @title Storage
 * @dev Store & retrieve value in a variable
 */
contract Hashbuzz {
  // event for EVM logging
  event OwnerSet(address owner);
  event CampaignerDeleted(string campaigner);
  event CampaignerAdded(string campaigner);
  event FundsDeposited(string campaigner, uint256 amount);
  event FundsWithdrawn(string campaigner, uint256 amount);
  event camapignClosed(string campaignAddress);
  event InteractorPaid(string interactor, string campaigner, uint256 amount);
  event InteractorPaidDeferred(string campaignAddress, uint256 amount);
  event NewCampaignIsAdded(string campaignAdddress, uint256 amount);
  // hashbuzz address, deployer of the contract
  address private owner;
  // campaigner's addresses mapped to balances for campaigners
  mapping(string => uint256) public balances;
  // campaigner's addresses mapped to set aside balances for campaigners, in order to pay those interactors whose wallet hasn't been connected
  mapping(string => uint256) public campaignBalances;

  //============================================
  // GETTING HBAR TO THE CONTRACT
  //============================================
  receive() external payable {}

  fallback() external payable {}

  //============================================
  // GETTING HBAR FROM THE CONTRACT
  //============================================
  function transferHbar(address payable receiverAddress, uint256 amount) public {
    receiverAddress.transfer(amount);
  }

  function sendHbar(address payable receiverAddress, uint256 amount) public {
    require(receiverAddress.send(amount), "Failed to send Hbar");
  }

  function callHbarToPayee(address payable receiverAddress, uint256 amount) public {
    (bool sent, ) = receiverAddress.call{value: amount}("");
    require(sent, "Failed to send Hbar");
  }

  /**
   * @dev update balance of the campaigner
   * @param amount amount to be updated
   * @param deposit deposit or withdrawl
   */
  function updateBalance(
    string memory campaigner,
    uint256 amount,
    bool deposit
  ) public payable {
    if (deposit) {
      if (balances[campaigner] > 0) {
        balances[campaigner] += amount;
      } else {
        addCampaigner(campaigner);
        balances[campaigner] += amount;
      }
      emit FundsDeposited(campaigner, amount);
    } else {
      require(balances[campaigner] > amount);
      balances[campaigner] -= amount;
      emit FundsWithdrawn(campaigner, amount);
    }
  }

  /**
   * @dev pay to interactor from campaign balances
   * @param campaignAddress address of campaign
   * @param amount amount to be updated
   */
  function payInteractorFromCampaignBalances(
    string memory campaignAddress,
    uint256 amount
  ) public {
    require(campaignBalances[campaignAddress] > amount);
    campaignBalances[campaignAddress] -= amount;
    //payable(interactor).transfer(amount);
    emit InteractorPaidDeferred(campaignAddress, amount);
  }

  /**
   * @dev add balnce for the campaign;
   * @param campaigner address of campaigner
   * @param amount amount to be updated
   */
  function addCampaign(
    string memory campaigner,
    string memory campaignAddress,
    uint256 amount
  ) public{
    require(balances[campaigner] > amount);
    balances[campaigner] -= amount;
    emit FundsWithdrawn(campaigner, amount);
    campaignBalances[campaignAddress] = amount;
    emit NewCampaignIsAdded(campaignAddress, amount);
  }

  /**
   * @dev close cmapaign while expiring the campaign;
   * @param campaigner address of campaigner
   * @param campaignAddress campaign address which need to be cloded.
   */
  function closeCampaign(
    string memory campaigner,
    string memory campaignAddress
  ) public{
    balances[campaigner] += campaignBalances[campaignAddress];
    campaignBalances[campaignAddress] = 0;
    emit camapignClosed(campaignAddress);
  }

  //Set contract deployer as owner
  constructor() {
    owner = msg.sender; // 'msg.sender' is sender of current call, contract deployer for a constructor
    emit OwnerSet(owner);
  }

  /**
   * @dev add campaigner
   * @param newCampaigner address of new campaigner
   */
  function addCampaigner(string memory newCampaigner) public {
    require(balances[newCampaigner] == 0);
    emit CampaignerAdded(newCampaigner);
    balances[newCampaigner] = 0;
  }

  /**
   * dangerous function, just for testing
   */
  function deleteCampaigner(string memory campaigner) public {
    //require(balances[campaigner] == 0);
    balances[campaigner] = 0;
  }

  function getBalance(string memory campaigner) public view returns (uint256) {
    return balances[campaigner];
  }

   /**
   * @dev add campaigner
   * @param campaignAddress address of new campaigner
   */
   function getCampaignBalance(string memory campaignAddress) public view returns (uint256){
    return campaignBalances[campaignAddress];
   }
}