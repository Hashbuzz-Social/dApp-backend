/* eslint-disable @typescript-eslint/no-unsafe-call */
import OpenAI from 'openai';
import { Request, Response } from "express";
import { BAD_REQUEST } from 'http-status-codes';
import { isEmpty } from 'lodash';

export const openAi = async (req: Request, res: Response) => {
    const openai = new OpenAI({
        apiKey: process.env.OPEN_AI_KEY,
      });
    
      const {message} = req.body;

      if (
        isEmpty(message)
      ) {
          return res.status(BAD_REQUEST).json({ error: true, message: "Data fields should not be empty." });
        }
  
      if(message) {      
          const completion = await openai.chat.completions.create({
            messages: [{ role: 'user', content: message}],
            model: 'gpt-3.5-turbo',
        });
        res.json({ message:completion.choices[0].message.content });
      } 
}
