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
  event InteractorPaid(string interactor, string campaigner, uint256 amount);
  event InteractorPaidDeferred(string interactor, string campaigner, uint256 amount);
  event InteractorPaymentSetAside(string campaigner, uint256 amount);
  // hashbuzz address, deployer of the contract
  address private owner;
  // campaigner's addresses mapped to balances for campaigners
  mapping(string => uint256) public balances;
  // campaigner's addresses mapped to set aside balances for campaigners, in order to pay those interactors whose wallet hasn't been connected
  mapping(string => uint256) public setAsidebalances;

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
      }
      emit FundsDeposited(campaigner, amount);
    } else {
      require(balances[campaigner] > amount);
      balances[campaigner] -= amount;
      emit FundsWithdrawn(campaigner, amount);
    }
  }

  /**
   * @dev pay to interactor
   * @param campaigner address of campaigner
   * @param interactor address payable of interactor
   * @param amount amount to be updated
   * @param instant instant or deferred(in case wallet not connected)
   */
  function payInteractor(
    string memory campaigner,
    string memory interactor,
    uint256 amount,
    bool instant
  ) public {
    require(balances[campaigner] > amount);
    if (instant) {
      updateBalance(campaigner, amount, false);
    } else {
      setAsidePaymentsForInteractor(campaigner, amount);
    }
    //payable(interactor).transfer(amount);
    emit InteractorPaid(interactor, campaigner, amount);
  }

  /**
   * @dev pay to interactor from setaside balnces
   * @param campaigner address of campaigner
   * @param interactor address payable of interactor
   * @param amount amount to be updated
   */
  function payInteractorFromAsideBalances(
    string memory campaigner,
    string memory interactor,
    uint256 amount
  ) public {
    require(setAsidebalances[campaigner] > amount);
    setAsidebalances[campaigner] -= amount;
    //payable(interactor).transfer(amount);
    emit InteractorPaidDeferred(interactor, campaigner, amount);
  }

  /**
   * @dev set aside payments
   * @param campaigner address of campaigner
   * @param amount amount to be updated
   */
  function setAsidePaymentsForInteractor(string memory campaigner, uint256 amount) public {
    require(balances[campaigner] > amount);
    balances[campaigner] -= amount;
    emit FundsWithdrawn(campaigner, amount);
    setAsidebalances[campaigner] += amount;
    emit InteractorPaymentSetAside(campaigner, amount);
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
    setAsidebalances[newCampaigner] = 0;
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
}
