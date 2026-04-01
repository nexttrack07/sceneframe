[Replicate has joined Cloudflare](https://replicate.com/blog/replicate-cloudflare)

[Playground](https://replicate.com/openai/gpt-4o-mini) [API](https://replicate.com/openai/gpt-4o-mini/api) [Examples](https://replicate.com/openai/gpt-4o-mini/examples) [README](https://replicate.com/openai/gpt-4o-mini/readme)

Run replicate/openai-gpt-4o-mini-internal with an API

Use one of our client libraries to get started quickly.

Node.js

Python

HTTP

Set the `REPLICATE_API_TOKEN` environment variable

```shell
export REPLICATE_API_TOKEN=<paste-your-token-here>
```

VisibilityCopy

[Learn more about authentication](https://replicate.com/openai/gpt-4o-mini/api/learn-more#authentication)

Install Replicate’s Node.js client library

```shell
npm install replicate
```

Copy

[Learn more about setup](https://replicate.com/openai/gpt-4o-mini/api/learn-more#setup)

Run **openai/gpt-4o-mini** using Replicate’s API. Check out the model's [schema](https://replicate.com/openai/gpt-4o-mini/api/schema) for an overview of inputs and outputs.

```javascript
import Replicate from "replicate";
const replicate = new Replicate();

const input = {
    prompt: "My situationship is starting to cross over into more than \"friends with benefits\" territory. I'm catching feelings, but this is not in my five year plan. What should I do?",
    system_prompt: "You are a helpful assistant."
};

for await (const event of replicate.stream("openai/gpt-4o-mini", { input })) {
  process.stdout.write(`${event}`)
};

//=> "Navigating a situationship can be challenging, especiall...
```

Copy

[Learn more](https://replicate.com/openai/gpt-4o-mini/api/learn-more)

Copy model identifier (for use with [replicate.run](https://replicate.com/docs/topics/models/run-a-model#run-a-model-with-the-api))

**This model is booted and ready for API calls.**

Official models are always on, maintained, and have predictable pricing.

This model is priced per input token and output token. [View more.](https://replicate.com/openai/gpt-4o-mini#pricing)

Show

Copy

Copy

Copy