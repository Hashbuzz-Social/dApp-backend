

export const startPublishingCampaign = async (campaignId: number, userId: number): Promise<void> => {
    // get the cmapign details 
    // check is cmapaign is valid for the publishing 
    // then crate fiest conent post to X platform using API
    // emit event to next setep i.e to perform SM contract tranction to publish the campaign
    // return fist tweet Id or post Id;
    
    
}


const publshCampaignSMTransactionHandler = async (campaignId: number, userId: number): Promise<void> => {
    // ferform create campaign transaction on SM
    // is scuccess then update remaingn balance and emit event {Campaigner:Balance:Update {userId , newBalance , enityType, entityid}}
    // then emit next step event to perform the final tweet thered about rates and closing time of the campaign
    // update transaction status in DB
    //  update campaign status in DB
    // return transaction Id

    // if faiils then delete the campaign and return error
    // emit CampaignPublish:Error event with error message and userID campaignId

};

const publshCampaignFinalTweetHandler = async (campaignId: number, userId: number): Promise<void> => {

    // create final tweet
    // publish the final tweet

    // if fails then retry 3 times

    // if success then schedule close campaign event emiiter to BullMQ
    // return sse to the client with the final tweet id and campaignId, userId
};





