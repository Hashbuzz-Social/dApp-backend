import passwordService from "@services/password-service";
import twitterCardService from "@services/twitterCard-service";
import { CustomError, ParamMissingError } from "@shared/errors";
import { sensitizeUserData } from "@shared/helper";
import prisma from "@shared/prisma";
import { Request, Response, Router } from "express";
import { body, query } from "express-validator";
import statuses from "http-status-codes";
import JSONBigInt from "json-bigint";
import { isEmpty } from "lodash";

const router = Router();
const { OK, BAD_REQUEST } = statuses;

const cardTypes = ["Pending", "Completed", "Running"];

router.get("/twitter-card", query("status").isIn(cardTypes), getAllCard);
router.put("/update-password", body("email").isEmail(), body("password").isStrongPassword(), updatePassword);
router.patch("/update-email", body("email").isEmail(), body("password").isStrongPassword(), updateEmail);

function getAllCard(req: Request, res: Response) {
  (async () => {
    const status = req.query.status as any as string;
    const data = await twitterCardService.getAllTwitterCardByStatus(status);
    if (data && data.length > 0) {
      return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(data)));
    } else res.status(OK).json([]);
  })();
}

function updatePassword(req: Request, res: Response) {
  (async () => {
    const { password, oldPassword }: { password: string; oldPassword?: string } = req.body;
    if (req.currentUser?.salt && req.currentUser.hash && isEmpty(oldPassword)) {
      throw new ParamMissingError("Password rest is only allowed with old password.");
    }

    if (oldPassword && password && req.currentUser?.salt && req.currentUser.hash) {
      //?? match the old password.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const matchOldPassword = passwordService.validPassword(oldPassword, req.currentUser.salt, req.currentUser.hash);
      //!! if not matched throw error
      if (!matchOldPassword) throw new ParamMissingError("Provided old password is not matching.");

      //old password is match now generate salt and hash for given password.
      const { salt, hash } = passwordService.createPassword(password);
      await prisma.user_user.update({
        where: { id: req.currentUser.id },
        data: {
          salt,
          hash,
        },
      });

      return res.status(OK).json({ message: "Password updated successfully." });
    }

    //!! reset password for newly created admin.
    if (!req.currentUser?.salt && !req.currentUser?.hash && password) {
      // create new password key and salt
      const { salt, hash } = passwordService.createPassword(password);
      //!! Save to db.
      await prisma.user_user.update({
        where: { id: req.currentUser?.id },
        data: {
          salt,
          hash,
        },
      });
      return res.status(OK).json({ message: "Password created successfully." });
    }
  })();
}

function updateEmail(req: Request, res: Response) {
  (async () => {
    const { email, password }: { email: string; password: string } = req.body;
    if (!req.currentUser?.hash || !req.currentUser.salt) {
      throw new ParamMissingError("First update your password.");
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const isPasswordMatched = passwordService.validPassword(password, req.currentUser?.salt, req.currentUser?.hash);
    if (!isPasswordMatched) throw new ParamMissingError("Password used is incorrect");

    //if password matched then update email and send updated user's data as response;
    const updatedUser = await prisma.user_user.update({
      where: { id: req.currentUser.id },
      data: {
        email,
      },
    });
    return res.status(OK).json({
      message: "Email updated successfully",
      user: JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(updatedUser))),
    });
  })();
}

export default router;

