// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.11;

/**
 * @title Storage
 * @dev Store & retrieve value in a variable
 */
contract Hashbuzz {

    // event for EVM logging
    event OwnerSet(address owner);
    event CampaignerAdded(address owner);
    event FundsDeposited(address campaigner, uint amount);
    event FundsWithdrawn(address campaigner, uint amount);
    event InteractorPaid(address interactor, address campaigner, uint amount);
    event InteractorPaymentSetAside(address campaigner, uint amount);
    // hashbuzz address, deployer of the contract
    address private owner;
    // campaigner's addresses mapped to balances for campaigners
    mapping(address => uint) public balances;
    // campaigner's addresses mapped to set aside balances for campaigners, in order to pay those interactors whose wallet hasn't been connected
    mapping(address => uint) public setAsidebalances;

    /**
     * @dev update balance of the campaigner
     * @param amount amount to be updated
     * @param deposit deposit or withdrawl
     */
    function updateBalance(address campaigner, uint amount, bool deposit) public payable {
      if (deposit) {
        balances[campaigner] += amount;
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
    function payInteractor(address campaigner, address payable interactor, uint amount, bool instant) public payable {
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
     * @dev set aside payments
     * @param campaigner address of campaigner
     * @param amount amount to be updated
     */
    function setAsidePaymentsForInteractor(address campaigner, uint amount) public payable {
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
    function addCampaigner(address newCampaigner) public {
        require( balances[newCampaigner] == 0 && setAsidebalances[newCampaigner] == 0);
        emit CampaignerAdded(newCampaigner);
        balances[newCampaigner] = 0;
        setAsidebalances[newCampaigner] = 0;
    }

    function getBalance(address campaigner) public view returns (uint) {
        return balances[campaigner];
    }
}