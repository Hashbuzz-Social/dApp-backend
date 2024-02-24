import { nodeURI } from "@shared/helper";
import prisma from "@shared/prisma";
import logger from "jet-logger";
import { Token } from "src/@types/custom";




const getTokenDetails = async (tokenID: string): Promise<any> => {
  const TOKEN_INFO_URI = `${nodeURI}/api/v1/tokens/${tokenID}`;
  if (!tokenID) throw new Error("Account id not defined !");

  const req = await fetch(TOKEN_INFO_URI);
  const data = await req.json();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return data;
};

const checkAvailableTokens = async (accountId: string) => {
  try {
    if (!accountId) throw new Error("Account id not defined !");
    const ACCOUNT_INFO_URI = `${nodeURI}/api/v1/accounts/${accountId}`;

    const acRequest = await fetch(ACCOUNT_INFO_URI);
    const data = await acRequest.json();
    const balances = data.balance;
    const tokens: Token[] = balances?.tokens;

    if (tokens && tokens.length > 0) {
      const tokensInfo = await Promise.all(
        tokens.map(async (token) => getTokenDetails(token.token_id))
      );

      await Promise.all(
        tokensInfo.map((tokenInfo) =>
          prisma.whiteListedTokens.upsert({
            where: { token_id: tokenInfo.token_id },
            create: {
              name: tokenInfo.name,
              token_id: tokenInfo.token_id,
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              //@ts-ignore
              tokendata: tokenInfo,
              token_type:
                tokenInfo.type === "FUNGIBLE_COMMON"
                  ? "fungible"
                  : "nonfungible",
              added_by: 1,
              token_symbol: tokenInfo.symbol,
              decimals: tokenInfo.decimals,
              contract_id: accountId,
            },
            update: {
              token_id: tokenInfo.token_id,
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              //@ts-ignore
              tokendata: tokenInfo,
            },
          })
        )
      );
    }
  } catch (e) {
    logger.err(e);
  }
};

export default {
  checkAvailableTokens,
} as const;

