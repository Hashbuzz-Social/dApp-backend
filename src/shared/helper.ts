import { user_user } from "@prisma/client";

// eslint-disable-next-line @typescript-eslint/ban-types
export const rmKeyFrmData = <T extends Object>(d: T, listOfKey: Array<keyof T>) => {
  listOfKey.forEach((key) => delete d[key]);
  return d;
};

export const sensitizeUserData = (userData: Partial<user_user>) => {
  return rmKeyFrmData(userData, [
    "password",
    "twitter_access_token",
    "business_twitter_access_token",
    "business_twitter_access_token_secret",
    "twitter_access_token_secret",
    "last_login",
    "date_joined",
    "is_superuser",
    "is_staff",
  ]);
};
