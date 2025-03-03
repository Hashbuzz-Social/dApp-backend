import JSONBigInt from 'json-bigint';

export const safeParsedData = <T>(data: T): T =>
  JSONBigInt.parse(JSONBigInt.stringify(data));
