// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.4.9 <0.9.0;

import "./interface/IRandomNumberGenerate.sol";

contract RandomNumberGenerate {
    address constant PRECOMPILE_ADDRESS = address(0x169);
    uint32 randNum;

    function getPseudorandomSeed() external returns (bytes32 randomBytes) {
        (bool success, bytes memory result) = PRECOMPILE_ADDRESS.call(
            abi.encodeWithSelector(
                IPrngSystemContract.getPseudorandomSeed.selector
            )
        );
        require(success);
        randomBytes = abi.decode(result, (bytes32));
    }

    /**
     * Returns a pseudorandom number in the range [lo, hi) using the seed generated from "getPseudorandomSeed"
     */
    function getPseudorandomNumber(
        uint32 lo,
        uint32 hi
    ) internal returns (uint32) {
        (bool success, bytes memory result) = PRECOMPILE_ADDRESS.call(
            abi.encodeWithSelector(
                IPrngSystemContract.getPseudorandomSeed.selector
            )
        );
        require(success);
        uint32 choice;
        assembly {
            choice := mload(add(result, 0x20))
        }
        randNum = lo + (choice % (hi - lo));
        return randNum;
    }
}
