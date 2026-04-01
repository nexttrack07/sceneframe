[Replicate has joined Cloudflare](https://replicate.com/blog/replicate-cloudflare)

[Playground](https://replicate.com/google/gemini-2.5-flash) [API](https://replicate.com/google/gemini-2.5-flash/api) [Examples](https://replicate.com/google/gemini-2.5-flash/examples) [README](https://replicate.com/google/gemini-2.5-flash/readme)

Run replicate/google-gemini-2.5-flash with an API

Use one of our client libraries to get started quickly.

Node.js

Python

HTTP

Set the `REPLICATE_API_TOKEN` environment variable

```shell
export REPLICATE_API_TOKEN=<paste-your-token-here>
```

VisibilityCopy

[Learn more about authentication](https://replicate.com/google/gemini-2.5-flash/api/learn-more#authentication)

Install Replicate’s Node.js client library

```shell
npm install replicate
```

Copy

[Learn more about setup](https://replicate.com/google/gemini-2.5-flash/api/learn-more#setup)

Run **google/gemini-2.5-flash** using Replicate’s API. Check out the model's [schema](https://replicate.com/google/gemini-2.5-flash/api/schema) for an overview of inputs and outputs.

```javascript
import Replicate from "replicate";
const replicate = new Replicate();

const input = {
    images: ["https://replicate.delivery/pbxt/O1TXLIqsDC7pdOzMl259hqrdwkDLjxrf8Fsg2ZwYVIIkoHkm/replicate-prediction-vygd5qqab1rmc0ctb9cbr14cxw.jpg"],
    prompt: "describe this image in detail"
};

for await (const event of replicate.stream("google/gemini-2.5-flash", { input })) {
  process.stdout.write(`${event}`)
};

//=> "This stunning image depicts a solitary samurai warrior i...
```

Copy

[Learn more](https://replicate.com/google/gemini-2.5-flash/api/learn-more)

Copy model identifier (for use with [replicate.run](https://replicate.com/docs/topics/models/run-a-model#run-a-model-with-the-api))

**This model is booted and ready for API calls.**

Official models are always on, maintained, and have predictable pricing.

This model is priced per input token and output token. [View more.](https://replicate.com/google/gemini-2.5-flash#pricing)

Outputs from this model can be sold or used in paid products.

Show

Copy

Copy

Copy