import OpenAI from 'openai';
import { Request, Response, NextFunction } from "express";
import { StatusCodes } from 'http-status-codes';
import { isEmpty } from 'lodash';
import { getConfig } from '@appConfig';

export const openAi = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = (await getConfig()).app.openAIKey;
    const openai = new OpenAI({
      apiKey
    });

    const { message } = req.body;

    if (isEmpty(message)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: true, message: "Data fields should not be empty." });
    }

    if (message) {
      const completion = await openai.chat.completions.create({
        messages: [{ role: 'user', content: message }],
        model: 'gpt-3.5-turbo',
      });
      res.json({ message: completion.choices[0].message.content });
    }
  } catch (error) {
    next(error);
  }
}
