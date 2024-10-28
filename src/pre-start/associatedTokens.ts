import prisma from "@shared/prisma";
import logger from "jet-logger";
import { AccountId } from "@hashgraph/sdk";
import { utilsHandlerService } from "@services/ContractUtilsHandlers";
import { networkHelpers } from "@shared/NetworkHelpers";
import { AccountDetails, TokenBalance } from "src/@types/networkResponses";




const checkAvailableTokens = async (accountId: string) => {
  try {
    if (!accountId) throw new Error("Account id not defined!");

    const data = await networkHelpers.getAccountDetails<AccountDetails>(accountId);
    const balances = data.balance;
    const networkTokens: TokenBalance[] = balances?.tokens;
    const localTokens = await prisma.whiteListedTokens.findMany();

    const additionalInLocal = localTokens.filter(localToken =>
      !networkTokens.some(networkToken => networkToken.token_id === localToken.token_id)
    );

    const additionalInNetwork = networkTokens.filter(networkToken =>
      !localTokens.some(localToken => localToken.token_id === networkToken.token_id)
    );

    if (additionalInLocal.length > 0 || additionalInNetwork.length > 0) {
      console.log(`Additional token found in local DB ${additionalInLocal.length} and network associated ${additionalInNetwork.length}.`);

      // All fungible whitelisted tokens
      const allContractAllowedTokens = await utilsHandlerService.getAllWhitelistedTokens(1); // Output will be EVM address
      console.log("All contract allowed tokens:", allContractAllowedTokens);

      const allContractAllowedTokenIds = allContractAllowedTokens.map(token =>
        AccountId.fromEvmAddress(0, 0, token).toString()
      );
      console.log("All contract allowed token ids:", allContractAllowedTokenIds);

      const tokenExtraFromNetwork = allContractAllowedTokenIds.filter(t =>
        !networkTokens.find(nt => nt.token_id === t)
      );

      const tokenExtraInLocal = localTokens.filter(t =>
        !allContractAllowedTokenIds.find(nt => nt === t.token_id)
      );

      if (tokenExtraFromNetwork.length > 0) {
        try {
          // Remove it from contract allowed tokens
          await Promise.all(tokenExtraFromNetwork.map(async token => {
            console.log(`Disassociating token ${token}`);
            const localToken = localTokens.find(t => t.token_id === token);
            if (localToken) {
              await prisma.whiteListedTokens.delete({
                where: { id: localToken.id }
              });
            }
            return utilsHandlerService.associateToken(token, 1, false);
          }));
          console.log("Tokens successfully disassociated.");
        } catch (error) {
          console.error("Error disassociating tokens:", error);
        }
      }

      if (tokenExtraInLocal.length > 0) {
        try {
          // Remove it from local DB
          await prisma.whiteListedTokens.deleteMany({
            where: {
              token_id: {
                in: tokenExtraInLocal.map(t => {
                  console.log(`Removing token ${t.token_id} from local DB. Add it from Admin panel if required.`);
                  return t.token_id;
                })
              }
            }
          });
          console.log("Tokens successfully removed from local DB.");
        } catch (error) {
          console.error("Error removing tokens from local DB:", error);
        }
      }
    } else {
      console.log("No additional tokens found in local DB and network associated.");
    }
  } catch (e) {
    logger.err(e);
  }
};
export default {
  checkAvailableTokens,
} as const;

