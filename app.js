const Twit = require('twit');

const T = new Twit({
  consumer_key: 'EKQ7GpcHelxQrLpv9EWgsAxvd',
  consumer_secret: 'AyFnZWztKGCooCFd1rYzynbdTgLNeLlCJY2h6TZCaZQeFjT4kF',
  access_token: '1672702738470416387-zGORvDBGRlIJL7ge8IwQ0Rr03dkmxd',
  access_token_secret: 'xsLsZ1VQtrNX0ce5PbkIKgavuLzPRcklHuXoQjgVs3xSg',
  version: '2', 
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
T.get('statuses/show/:id', { id: 'TWEET_ID' }, function (err, data, response) {
  if (err) {
    console.error(err);
  } else {
    const tweet = data;
    console.log('Tweet:', tweet);
    console.log('Likes:', tweet.favorite_count);
    console.log('Retweets:', tweet.retweet_count);
    console.log('Replies:', tweet.reply_count); // Note: The Twitter API may not provide a direct "replies" count.
  }
});
