// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.17;

import "./FungibleToken/HederaTokenService.sol";
import "./FungibleToken/HederaResponseCodes.sol";
import "./interface/IHederaTokenService.sol";
import "./FungibleToken/ExpiryHelper.sol";
import "./FungibleToken/KeyHelper.sol";
import "./RandomNumberGenerate.sol";
import "./library/Roles.sol";

contract HashbuzzV2 is
    HederaTokenService,
    KeyHelper,
    ExpiryHelper,
    RandomNumberGenerate
{
    using Roles for Roles.Role;

    Roles.Role private _addCampaign;

    // Type of Campaign 0 is Hbar , 1 is Fungible and 2 is NFT
    uint32 public constant HBAR = 0;
    uint32 public constant FUNGIBLE = 1;
    uint32 public constant NFT = 2;

    // Hashbuzz address, deployer of the contract
    address private owner;
    // Campaigner's address => campaigner's (HBAR Balance)
    mapping(address => uint256) public balances;
    // Campaigner's address => Token ID => campaigner's (FT and NFT Balance)
    mapping(address => mapping(address => mapping(uint256 => uint256)))
        public tokenBalances;
    // Campaign's address => Campaign's balance (HBAR)
    mapping(address => uint256) public campaignBalances;
    // Campaign's address => Campaign's balance (FT and NFT Balance)
    mapping(address => mapping(address => mapping(uint256 => uint256)))
        public tokenCampaignBalances;
    // Campaigner's address => Token Id => Is Associate
    mapping(address => mapping(address => mapping(uint256 => bool))) associateCampainer;
    // Campaign's address => Campaign token type
    mapping(address => mapping(uint256 => uint256)) campaignEndTime;
    // Campaigner's address => id
    mapping(address => uint32) public nftCampaigner;
    // Campaign's address => Is campaign closed
    mapping(address => mapping(uint256 => bool)) isCampaignClosed;
    // Id of campaigner
    uint32 public id = 1;
    // Campaign address mapped to random number
    mapping(address => uint32) public campaignRandomNumber;

    //============================================
    // GETTING HBAR TO THE CONTRACT
    //============================================
    receive() external payable {}

    fallback() external payable {}

    // event for EVM logging
    event OwnerSet(address owner);
    event CampaignerDeleted(address campaigner);
    event CampaignerAdded(address campaigner);
    event FundsDeposited(address campaigner, uint256 amount);
    event FundsWithdrawn(address campaigner, uint256 amount);
    event campaignClosed(address campaignAddress, uint32 campaignType);
    event campaignExpired(address campaignAddress, uint32 campaignType);
    event InteractorPaid(
        address interactor,
        address campaigner,
        uint256 amount
    );
    event InteractorPaidDeferred(address campaignAddress, uint256 amount);
    event NewCampaignIsAdded(
        address campaignAdddress,
        uint256 amount,
        uint32 campaignType
    );
    event ResponseCode(int responseCode);
    event CreatedToken(address tokenAddress);

    // Set contract deployer as owner
    constructor() {
        owner = msg.sender; // 'msg.sender' is sender of current call, contract deployer for a constructor
        emit OwnerSet(owner);
    }

    /**
     * @dev Associate the contract it selt
     * @param tokenAddress address of token
     */

    function contractAssociate(address tokenAddress) external {
        require(msg.sender == owner);

        int response = HederaTokenService.associateToken(
            address(this),
            tokenAddress
        );

        if (response != HederaResponseCodes.SUCCESS) {
            revert();
        }
    }

    /**
     * @dev Transfer the Token from user to contract
     * @param tokenId address of token
     * @param tokenAmount amount of token
     */

    function transferTokenToContract(
        address tokenId,
        address from,
        int64 tokenAmount
    ) public {
        (int64 responses, int32 tokenType) = HederaTokenService.getTokenType(
            tokenId
        );

        if (responses == HederaResponseCodes.SUCCESS) {
            if (tokenType == 0) {
                int response = HederaTokenService.transferToken(
                    tokenId,
                    from,
                    address(this),
                    tokenAmount
                );

                if (response == HederaResponseCodes.SUCCESS) {
                    tokenBalances[from][tokenId][FUNGIBLE] += uint64(
                        int64(tokenAmount)
                    );
                } else {
                    revert();
                }
            }
        } else {
            revert();
        }
    }

    /**
     * @dev Associate the token from user
     * @param sender address of sender
     * @param tokenAddress address of token
     */
    function tokenAssociate(address sender, address tokenAddress) external {
        (int64 responses, int32 tokenType) = HederaTokenService.getTokenType(
            tokenAddress
        );
        int associateResponse = HederaTokenService.associateToken(
            sender,
            tokenAddress
        );

        if (
            responses == HederaResponseCodes.SUCCESS &&
            tokenType == 0 &&
            associateResponse == HederaResponseCodes.SUCCESS
        ) {
            associateCampainer[sender][tokenAddress][FUNGIBLE] = true;
        } else if (
            responses == HederaResponseCodes.SUCCESS &&
            tokenType == 1 &&
            associateResponse == HederaResponseCodes.SUCCESS
        ) {
            associateCampainer[sender][tokenAddress][NFT] = true;
        } else {
            revert();
        }
    }

    /**
     * @dev Dissociate the token from user
     * @param sender address of sender
     * @param tokenAddress address of token
     */
    function tokenDissociate(address sender, address tokenAddress) external {
        int response = HederaTokenService.dissociateToken(sender, tokenAddress);

        if (response != HederaResponseCodes.SUCCESS) {
            revert();
        }
    }

    //============================================
    // GETTING HBAR FROM THE CONTRACT
    //============================================
    function transferHbar(
        address payable receiverAddress,
        address campaignAddress,
        uint256 amount
    ) public {
        require(_addCampaign.has(msg.sender));
        require(isCampaignClosed[campaignAddress][HBAR] == true);
        receiverAddress.transfer(amount);
        balances[receiverAddress] += amount;
        campaignBalances[campaignAddress] -= amount;
    }

    /**
     * @dev Given the access of user.
     * @dev Only owner can call this function
     * @param user address of user
     */
    function addUser(address user) public returns (bool) {
        require(user != address(0));
        require(msg.sender == owner);
        _addCampaign.add(user);
        return true;
    }

    /**
     * @dev Send Hbar token
     * @param receiverAddress address of receiver
     * @param amount amount of Hbar
     */
    function sendHbar(address payable receiverAddress, uint256 amount) public {
        require(_addCampaign.has(msg.sender));
        require(receiverAddress.send(amount));
    }

    function callHbarToPayee(
        address payable receiverAddress,
        uint256 amount
    ) public {
        require(_addCampaign.has(msg.sender));
        (bool sent, ) = receiverAddress.call{value: amount}("");
        require(sent);
    }

    /**
     * @dev update balance of the campaigner
     * @param amount amount to be updated
     * @param deposit deposit or withdrawl
     */
    function updateBalance(
        address campaigner,
        uint256 amount,
        bool deposit
    ) public payable {
        require(_addCampaign.has(msg.sender));
        if (deposit) {
            if (balances[campaigner] == 0) {
                addCampaigner(campaigner);
            }
            balances[campaigner] += amount;
            emit FundsDeposited(campaigner, amount);
        } else {
            require(balances[campaigner] >= amount);
            balances[campaigner] -= amount;
            emit FundsWithdrawn(campaigner, amount);
        }
    }

    /**
     * @dev add balance for the campaign;
     * @param amount amount to be updated
     */
    function addCampaign(
        address campaignAddress,
        address campaigner,
        uint256 amount
    ) public {
        require(_addCampaign.has(msg.sender));
        require(campaignBalances[campaignAddress] == 0);
        require(balances[campaigner] >= amount);
        balances[campaigner] -= amount;
        campaignBalances[campaignAddress] = amount;
        emit NewCampaignIsAdded(campaignAddress, amount, HBAR);
    }

    /**
     * @dev close campaign while expiring the campaign;
     * @param campaignAddress campaign address which need to be expired.
     */
    function expiryCampaign(
        address campaignAddress,
        address campaigner
    ) public {
        require(_addCampaign.has(msg.sender));
        require(block.timestamp > campaignEndTime[campaignAddress][HBAR]);
        require(isCampaignClosed[campaignAddress][HBAR] == true);
        balances[campaigner] += campaignBalances[campaignAddress];
        campaignBalances[campaignAddress] = 0;
        emit campaignExpired(campaignAddress, HBAR);
    }

    function closeCampaign(
        address campaignAddress,
        uint256 campaignExpiryTime
    ) public {
        require(_addCampaign.has(msg.sender));
        require(isCampaignClosed[campaignAddress][HBAR] == false);
        isCampaignClosed[campaignAddress][HBAR] = true;
        campaignEndTime[campaignAddress][HBAR] =
            block.timestamp +
            campaignExpiryTime;
        emit campaignClosed(campaignAddress, HBAR);
    }

    /**
     * @dev add campaigner
     * @param newCampaigner address of new campaigner
     */
    function addCampaigner(address newCampaigner) public {
        require(_addCampaign.has(msg.sender));
        emit CampaignerAdded(newCampaigner);
        balances[newCampaigner] = 0;
    }

    /**
     * dangerous function, just for testing
     */
    function deleteCampaigner(address campaigner) public {
        require(_addCampaign.has(msg.sender));
        balances[campaigner] = 0;
    }

    /**
     * @param campaigner address of campaigner
     */
    function getBalance(address campaigner) public view returns (uint256) {
        return balances[campaigner];
    }

    /**
     * @dev add campaigner
     * @param campaignAddress address of new campaigner
     */
    function getCampaignBalance(
        address campaignAddress
    ) public view returns (uint256) {
        return campaignBalances[campaignAddress];
    }

    /**
     * @dev pay to interactor from campaign balances
     * @param campaignAddress address of campaign
     * @param amount amount to be updated
     */
    function payInteractorFromCampaignBalances(
        address campaignAddress,
        uint256 amount
    ) public {
        require(_addCampaign.has(msg.sender));
        require(campaignBalances[campaignAddress] >= amount);
        campaignBalances[campaignAddress] -= amount;
        emit InteractorPaidDeferred(campaignAddress, amount);
    }

    /**
     * @dev add balance for the campaign;
     * @param tokenId address of tokenID
     * @param campaignAddress address of campaign
     * @param tokenAmount amount to be updated
     */
    function addFungibleAndNFTCampaign(
        address tokenId,
        address campaignAddress,
        address campaigner,
        int64 tokenAmount
    ) public {
        require(_addCampaign.has(msg.sender));
        (, int32 tokenType) = HederaTokenService.getTokenType(tokenId);
        if (tokenType == 0) {
            require(
                tokenBalances[campaigner][tokenId][FUNGIBLE] >=
                    uint64(int64(tokenAmount))
            );
            require(
                tokenCampaignBalances[campaignAddress][tokenId][FUNGIBLE] == 0
            );
            tokenBalances[campaigner][tokenId][FUNGIBLE] -= uint64(
                int64(tokenAmount)
            );
            tokenCampaignBalances[campaignAddress][tokenId][FUNGIBLE] = uint64(
                int64(tokenAmount)
            );
            emit NewCampaignIsAdded(
                campaignAddress,
                uint64(int64(tokenAmount)),
                FUNGIBLE
            );
        } else if (tokenType == 1) {
            int response = HederaTokenService.transferNFT(
                tokenId,
                campaigner,
                address(this),
                tokenAmount
            );
            if (response == HederaResponseCodes.SUCCESS) {
                tokenCampaignBalances[campaignAddress][tokenId][NFT] = uint64(
                    int64(tokenAmount)
                );
                emit NewCampaignIsAdded(
                    campaignAddress,
                    uint64(int64(tokenAmount)),
                    NFT
                );
            } else {
                revert();
            }
        }
    }

    /**
     * @dev close campaign while expiring the campaign;
     * @param tokenId id of token
     * @param campaign campaign address which need to be cloded.
     * @param tokenAmount amount of token
     */
    function expiryFungibleAndNFTCampaign(
        address tokenId,
        address campaign,
        address campaigner,
        int64 tokenAmount
    ) public {
        require(_addCampaign.has(msg.sender));
        (, int32 tokenType) = HederaTokenService.getTokenType(tokenId);
        if (tokenType == 0) {
            require(isCampaignClosed[campaign][FUNGIBLE] == true);
            require(block.timestamp > campaignEndTime[campaign][FUNGIBLE]);
            tokenCampaignBalances[campaign][tokenId][FUNGIBLE] -= uint64(
                int64(tokenAmount)
            );
            tokenBalances[campaigner][tokenId][FUNGIBLE] += uint64(
                int64(tokenAmount)
            );
            emit campaignExpired(campaign, FUNGIBLE);
        } else if (tokenType == 1) {
            require(isCampaignClosed[campaign][NFT] == true);
            require(block.timestamp > campaignEndTime[campaign][NFT]);
            int response = HederaTokenService.transferNFT(
                tokenId,
                address(this),
                campaigner,
                tokenAmount
            );
            if (response == HederaResponseCodes.SUCCESS) {
                tokenCampaignBalances[campaign][tokenId][NFT] -= uint64(
                    int64(tokenAmount)
                );
                emit campaignExpired(campaign, NFT);
            } else {
                revert();
            }
        }
    }

    /**
     * @param tokenId id of token
     * @param campaign address of campaign
     */

    function closeFungibleAndNFTCampaign(
        address tokenId,
        address campaign,
        uint256 campaignExpiryTime
    ) public {
        require(_addCampaign.has(msg.sender));
        (, int32 tokenType) = HederaTokenService.getTokenType(tokenId);
        if (tokenType == 0) {
            isCampaignClosed[campaign][FUNGIBLE] = true;
            campaignEndTime[campaign][FUNGIBLE] =
                block.timestamp +
                campaignExpiryTime;
            emit campaignClosed(campaign, FUNGIBLE);
        } else if (tokenType == 1) {
            isCampaignClosed[campaign][NFT] = true;
            campaignEndTime[campaign][NFT] =
                block.timestamp +
                campaignExpiryTime;
            emit campaignClosed(campaign, NFT);
        }
    }

    /**
     * @dev add campaigner
     * @param newCampaigner address of new campaigner
     * @param tokenId id of token
     */
    function addFungibleAndNFTCampaigner(
        address newCampaigner,
        address tokenId
    ) public {
        require(_addCampaign.has(msg.sender));
        (int64 responses, int32 tokenType) = HederaTokenService.getTokenType(
            tokenId
        );
        if (responses == HederaResponseCodes.SUCCESS && tokenType == 0) {
            tokenBalances[newCampaigner][tokenId][FUNGIBLE] = 0;
        } else if (responses == HederaResponseCodes.SUCCESS && tokenType == 1) {
            require(nftCampaigner[newCampaigner] == 0);
            nftCampaigner[newCampaigner] = id++;
        } else {
            revert();
        }
    }

    /**
     * dangerous function, just for testing
     */
    function deleteFungibleAndNFTCampaigner(
        address campaigner,
        address tokenId
    ) public {
        require(_addCampaign.has(msg.sender));
        (int64 responses, int32 tokenType) = HederaTokenService.getTokenType(
            tokenId
        );
        if (responses == HederaResponseCodes.SUCCESS && tokenType == 0) {
            tokenBalances[campaigner][tokenId][FUNGIBLE] = 0;
        } else if (responses == HederaResponseCodes.SUCCESS && tokenType == 1) {
            tokenBalances[campaigner][tokenId][NFT] = 0;
        } else {
            revert();
        }
    }

    /**
     * @dev Return balance of campaigner
     * @param campaigner address of campaigner
     * @param tokenId address of tokenId
     */
    function getFungibleAndNFTBalance(
        address campaigner,
        address tokenId
    ) public returns (uint256 res) {
        (int64 responses, int32 tokenType) = HederaTokenService.getTokenType(
            tokenId
        );
        if (responses == HederaResponseCodes.SUCCESS && tokenType == 0) {
            res = tokenBalances[campaigner][tokenId][FUNGIBLE];
        } else if (responses == HederaResponseCodes.SUCCESS && tokenType == 1) {
            res = tokenBalances[campaigner][tokenId][NFT];
        } else {
            revert();
        }
    }

    /**
     * @dev Return balanec of campaign
     * @param campaignAddress address of campaign
     * @param tokenId address of token
     */
    function getFungibleAndNFTCampaignBalance(
        address campaignAddress,
        address tokenId
    ) public returns (uint256 res) {
        (int64 response, int32 tokenType) = HederaTokenService.getTokenType(
            tokenId
        );
        if (response == HederaResponseCodes.SUCCESS && tokenType == 0) {
            res = tokenCampaignBalances[campaignAddress][tokenId][FUNGIBLE];
        } else if (response == HederaResponseCodes.SUCCESS && tokenType == 1) {
            res = tokenCampaignBalances[campaignAddress][tokenId][NFT];
        } else {
            revert();
        }
    }

    /**
     * @dev Distribute the reward
     * @param tokenId address of tokenId
     * @param campaigner address of campaigner
     * @param tokenAmount amount of token
     */
    function distributeFungible(
        address tokenId,
        address campaigner,
        address campaign,
        int64 tokenAmount
    ) external {
        require(_addCampaign.has(msg.sender));
        require(isCampaignClosed[campaign][FUNGIBLE] == true);
        if (associateCampainer[campaigner][tokenId][FUNGIBLE] == true) {
            int response = HederaTokenService.transferToken(
                tokenId,
                address(this),
                campaigner,
                tokenAmount
            );
            if (response == HederaResponseCodes.SUCCESS) {
                tokenCampaignBalances[campaign][tokenId][FUNGIBLE] -= uint64(
                    int64(tokenAmount)
                );
                tokenBalances[campaigner][tokenId][FUNGIBLE] += uint64(
                    int64(tokenAmount)
                );
            } else {
                revert();
            }
        }
    }

    /**
     * @dev Batch fungible transaction
     * @param tokenId address of tokenId
     * @param campaign address of campaign
     * @param campaigner[] address of campaigner
     * @param tokenAmount amount of token
     */

    function batchFungible(
        address tokenId,
        address campaign,
        address[] memory campaigner,
        int64 tokenAmount
    ) public {
        require(_addCampaign.has(msg.sender));
        require(isCampaignClosed[campaign][FUNGIBLE] == true);
        for (uint256 i = 0; i < campaigner.length; i++) {
            int response = HederaTokenService.transferToken(
                tokenId,
                address(this),
                campaigner[i],
                tokenAmount
            );
            if (response == HederaResponseCodes.SUCCESS) {
                tokenCampaignBalances[campaign][tokenId][FUNGIBLE] -= uint64(
                    int64(tokenAmount)
                );
                tokenBalances[campaigner[i]][tokenId][FUNGIBLE] += uint64(
                    int64(tokenAmount)
                );
            }
        }
    }

    /**
     * @dev Incase of Emergency , only owner can call this function
     * @param tokenId address of tokenId
     * @param tokenAmount amount of token
     */
    function emergencyWithdraw(
        address tokenId,
        address to,
        int64 tokenAmount
    ) public {
        require(msg.sender == owner);
        int response = HederaTokenService.transferToken(
            tokenId,
            address(this),
            to,
            tokenAmount
        );
        if (response != HederaResponseCodes.SUCCESS) {
            revert();
        }
    }

    /**
     * @dev Distribute the NFT
     * @param campaign address of campaign
     * @param campaigner address of campaigner
     * @param tokenId address of tokenId
     * @param tokenAmount amount of token
     */

    function distributeNFT(
        address campaign,
        address campaigner,
        address tokenId,
        int64 tokenAmount
    ) public {
        require(_addCampaign.has(msg.sender));
        require(isCampaignClosed[campaign][NFT] == true);
        if (associateCampainer[campaigner][tokenId][NFT] == true) {
            int response = HederaTokenService.transferNFT(
                tokenId,
                address(this),
                campaigner,
                tokenAmount
            );

            if (response == HederaResponseCodes.SUCCESS) {
                tokenCampaignBalances[campaign][tokenId][NFT] -= uint64(
                    int64(tokenAmount)
                );
                tokenBalances[campaigner][tokenId][NFT] += uint64(
                    int64(tokenAmount)
                );
            } else {
                revert();
            }
        }
    }
}
