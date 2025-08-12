/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router } from "express";
import userInfo from "@middleware/userInfo";
import { 
  handleBizTwitterHandle, 
  handlePersonalTwitterHandle,
  handleTwitterCallbackAPI,
  handleCheckXAccountStatus
} from "@controller/Integrations";

const router = Router();

router.get("/twitter/personalHandle", userInfo.getCurrentUserInfo, handlePersonalTwitterHandle);
router.get("/twitter/bizHandle", userInfo.getCurrentUserInfo, handleBizTwitterHandle);
router.post("/twitter/callback", userInfo.getCurrentUserInfo, handleTwitterCallbackAPI);
router.get("/twitter/status", userInfo.getCurrentUserInfo, handleCheckXAccountStatus);

export default router;
