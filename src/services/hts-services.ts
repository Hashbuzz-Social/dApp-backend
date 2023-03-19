import hederaService from "@services/hedera-service";
import { TokenInfoQuery } from "@hashgraph/sdk";

const getTokenInfo = async (tokenId: string) => {
  const query = new TokenInfoQuery().setTokenId(tokenId);

  //Sign with the client operator private key, submit the query to the network and get the token supply
  const info = await query.execute(hederaService.hederaClient);
  return info;
};

export default { getTokenInfo };
