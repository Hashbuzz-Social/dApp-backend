import { Router } from "express";
import userInfo from "@middleware/userInfo";
import { handleBizTwitterHandle, handlePersonalTwitterHandle } from "@controller/Integrations";

const router = Router();

router.get("/twitter/personalHandle", userInfo.getCurrentUserInfo, handlePersonalTwitterHandle);
router.get("/twitter/bizHandle", userInfo.getCurrentUserInfo, handleBizTwitterHandle);

export default router;
