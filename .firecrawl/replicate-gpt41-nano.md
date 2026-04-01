[Replicate has joined Cloudflare](https://replicate.com/blog/replicate-cloudflare)

[Playground](https://replicate.com/openai/gpt-4.1-nano) [API](https://replicate.com/openai/gpt-4.1-nano/api) [Examples](https://replicate.com/openai/gpt-4.1-nano/examples) [README](https://replicate.com/openai/gpt-4.1-nano/readme)

## Input

FormJSONNode.jsPythonHTTP

prompt
string

`Shift` \+ `Return` to add a new line

What is San Junipero?

The prompt to send to the model. Do not use if using messages.

system\_prompt
string

`Shift` \+ `Return` to add a new line

You are a helpful assistant.

System prompt to set the assistant's behavior

messages

This input type is only available via the API.

A JSON string representing a list of messages. For example: \[{"role": "user", "content": "Hello, how are you?"}\]. If provided, prompt and system\_prompt are ignored.

Default: \[\]

image\_input
file\[\]

Add multiple files

To pick up a draggable item, press the space bar.
While dragging, use the arrow keys to move the item.
Press space again to drop the item in its new position, or press escape to cancel.


List of images to send to the model

Default: \[\]

temperature
number

(minimum: 0, maximum: 2)

temperature

Sampling temperature between 0 and 2

Default: 1

max\_completion\_tokens
integer

Maximum number of completion tokens to generate

Default: 4096

top\_p
number

(minimum: 0, maximum: 1)

top\_p

Nucleus sampling parameter - the model considers the results of the tokens with top\_p probability mass. (0.1 means only the tokens comprising the top 10% probability mass are considered.)

Default: 1

frequency\_penalty
number

(minimum: -2, maximum: 2)

frequency\_penalty

Frequency penalty parameter - positive values penalize the repetition of tokens.

Default: 0

presence\_penalty
number

(minimum: -2, maximum: 2)

presence\_penalty

Presence penalty parameter - positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics.

Default: 0

Run this model in Node.js with [one line of code](https://replicate.com/docs/get-started/nodejs#quickstart-scaffold-a-project-with-a-one-liner):

npx create-replicate --model=openai/gpt-4.1-nano

or set up a project from scratch

Install [Replicate’s Node.js client library](https://github.com/replicate/replicate-javascript):

```shell
npm install replicate
```

Copy

Set the `REPLICATE_API_TOKEN` environment variable:

```shell
export REPLICATE_API_TOKEN=<paste-your-token-here>
```

VisibilityCopy

Find your API token in [your account settings](https://replicate.com/account/api-tokens).

Import and set up the client:

```javascript
import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});
```

Copy

Run openai/gpt-4.1-nano using Replicate’s API. Check out the [model's schema](https://replicate.com/openai/gpt-4.1-nano/api/schema) for an overview of inputs and outputs.

```javascript
const input = {
  top_p: 1,
  prompt: "What is San Junipero?",
  messages: [],
  image_input: [],
  temperature: 1,
  system_prompt: "You are a helpful assistant.",
  presence_penalty: 0,
  frequency_penalty: 0,
  max_completion_tokens: 4096
};

for await (const event of replicate.stream("openai/gpt-4.1-nano", { input })) {
  process.stdout.write(event.toString());
};
```

StreamingCopy

To learn more, take a look at [the guide on getting started with Node.js](https://replicate.com/docs/get-started/nodejs).

Install [Replicate’s Python client library](https://github.com/replicate/replicate-python):

```shell
pip install replicate
```

Copy

Set the `REPLICATE_API_TOKEN` environment variable:

```shell
export REPLICATE_API_TOKEN=<paste-your-token-here>
```

VisibilityCopy

Find your API token in [your account settings](https://replicate.com/account/api-tokens).

Import the client:

```python
import replicate
```

Copy

Run openai/gpt-4.1-nano using Replicate’s API. Check out the [model's schema](https://replicate.com/openai/gpt-4.1-nano/api/schema) for an overview of inputs and outputs.

```python
# The openai/gpt-4.1-nano model can stream output as it's running.
for event in replicate.stream(
    "openai/gpt-4.1-nano",
    input={
        "top_p": 1,
        "prompt": "What is San Junipero?",
        "messages": [],
        "image_input": [],
        "temperature": 1,
        "system_prompt": "You are a helpful assistant.",
        "presence_penalty": 0,
        "frequency_penalty": 0,
        "max_completion_tokens": 4096
    },
):
    print(str(event), end="")
```

StreamingCopy

To learn more, take a look at [the guide on getting started with Python](https://replicate.com/docs/get-started/python).

Set the `REPLICATE_API_TOKEN` environment variable:

```shell
export REPLICATE_API_TOKEN=<paste-your-token-here>
```

VisibilityCopy

Find your API token in [your account settings](https://replicate.com/account/api-tokens).

Run openai/gpt-4.1-nano using Replicate’s API. Check out the [model's schema](https://replicate.com/openai/gpt-4.1-nano/api/schema) for an overview of inputs and outputs.

```shell
curl -s -X POST \
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: wait" \
  -d $'{
    "input": {
      "top_p": 1,
      "prompt": "What is San Junipero?",
      "messages": [],
      "image_input": [],
      "temperature": 1,
      "system_prompt": "You are a helpful assistant.",
      "presence_penalty": 0,
      "frequency_penalty": 0,
      "max_completion_tokens": 4096
    }
  }' \
  https://api.replicate.com/v1/models/openai/gpt-4.1-nano/predictions
```

Copy

To learn more, take a look at [Replicate’s HTTP API reference docs](https://replicate.com/docs/reference/http).

Sign in to run this model

[Sign in with GitHub](https://replicate.com/login/github/?next=/openai/gpt-4.1-nano)

By signing in, you agree to our

[terms of service](https://replicate.com/terms) and [privacy policy](https://replicate.com/privacy)

## Output

PreviewJSON

San Junipero is a fictional town featured in the anthology series \*Black Mirror\*, specifically in the episode titled "San Junipero." The episode originally aired in 2016 and is one of the most acclaimed installments of the series.

In the story, San Junipero is depicted as a picturesque, nostalgic beach town set in California, primarily during the 1980s. It is revealed to be a virtual reality simulation where people can visit temporarily or permanently after death or while still alive. The town serves as a digital paradise, allowing residents to relive past memories, connect with loved ones, and choose to extend their consciousness beyond physical mortality.

The episode explores themes of love, memory, mortality, and the ethical dilemmas associated with virtual immortality, making San Junipero a significant and thought-provoking setting within the narrative.

```
{
  "completed_at": "2025-05-01T07:32:17.801240Z",
  "created_at": "2025-05-01T07:32:07.695000Z",
  "data_removed": false,
  "error": null,
  "id": "86zptcwbhxrm80cphb19cy8qh4",
  "input": {
    "prompt": "What is San Junipero?",
    "temperature": 1,
    "system_prompt": "You are a helpful assistant."
  },
  "logs": "Generated response in 1.2sec\n/usr/local/lib/python3.12/site-packages/cog/server/scope.py:21: ExperimentalFeatureWarning: current_scope is an experimental internal function. It may change or be removed without warning.\n  warnings.warn(",
  "metrics": {
    "predict_time": 1.188336235,
    "total_time": 10.10624
  },
  "output": "San Junipero is a fictional town featured in the anthology series *Black Mirror*, specifically in the episode titled \"San Junipero.\" The episode originally aired in 2016 and is one of the most acclaimed installments of the series.\n\nIn the story, San Junipero is depicted as a picturesque, nostalgic beach town set in California, primarily during the 1980s. It is revealed to be a virtual reality simulation where people can visit temporarily or permanently after death or while still alive. The town serves as a digital paradise, allowing residents to relive past memories, connect with loved ones, and choose to extend their consciousness beyond physical mortality.\n\nThe episode explores themes of love, memory, mortality, and the ethical dilemmas associated with virtual immortality, making San Junipero a significant and thought-provoking setting within the narrative.",
  "started_at": "2025-05-01T07:32:16.612904Z",
  "status": "succeeded",
  "urls": {
    "get": "https://api.replicate.com/v1/predictions/86zptcwbhxrm80cphb19cy8qh4",
    "cancel": "https://api.replicate.com/v1/predictions/86zptcwbhxrm80cphb19cy8qh4/cancel"
  },
  "version": "424cb94a603ffc45d854c113097edca6afdec13755c857085a0b426973e3b6e2"
}
```

Copy

Generated in

1.2 seconds

[Tweak it](https://replicate.com/openai/gpt-4.1-nano/versions/424cb94a603ffc45d854c113097edca6afdec13755c857085a0b426973e3b6e2?prediction=86zptcwbhxrm80cphb19cy8qh4) [Iterate in playground](https://replicate.com/playground?model=openai/gpt-4.1-nano&inputs=%7B%22prompt%22%3A%22What%20is%20San%20Junipero%3F%22%2C%22temperature%22%3A1%2C%22system_prompt%22%3A%22You%20are%20a%20helpful%20assistant.%22%7D) [Share](https://replicate.com/signin?next=https://replicate.com/openai/gpt-4.1-nano) [Report](https://replicate.com/p/86zptcwbhxrm80cphb19cy8qh4/report) [View full prediction](https://replicate.com/p/86zptcwbhxrm80cphb19cy8qh4)

Show logs

`Generated response in 1.2sec
/usr/local/lib/python3.12/site-packages/cog/server/scope.py:21: ExperimentalFeatureWarning: current_scope is an experimental internal function. It may change or be removed without warning.
warnings.warn(`

Copy logsFullscreen logsDownload logs

#### Pricing

$0.40

per million output tokens

or 2,500,000 tokens for $1

$0.10

per million input tokens

or 10,000,000 tokens for $1

[Check out our docs](https://replicate.com/docs/billing) for more information about how pricing works on Replicate. Looking for volume pricing? [Get in touch](mailto:sales@replicate.com).

## Readme

**GPT‑4.1 nano** is the fastest and most cost-efficient model in the GPT‑4.1 family. It delivers strong performance for lightweight tasks while supporting up to 1 million tokens of context. Designed for speed-critical and high-scale applications, nano is ideal for tasks like classification, autocomplete, and simple reasoning.

## Key Features

- Ultra-low latency and fast response times
- Lowest cost in the GPT-4.1 lineup
- Supports 1 million token context windows
- Optimized for short prompts and high-volume usage
- Competitive accuracy on key benchmarks

## Benchmark Highlights

- MMLU: 80.1%
- GPQA: 50.3%
- Aider Polyglot Diff (diff format): 45%
- MultiChallenge: 15%
- IFEval: 75%

## Use Cases

- Text classification
- Autocomplete and structured text generation
- Fast Q&A over small or medium context
- Low-latency applications at scale
- Budget-sensitive or high-throughput tasks

## Notes

- Available via the OpenAI API
- Not currently available in ChatGPT
- Supports up to 1 million tokens of context

GPT‑4.1 nano is built for developers who need speed, scale, and affordability.

Model created
10 months, 4 weeks ago


Model updated
2 months, 1 week ago


Copy model identifier (for use with [replicate.run](https://replicate.com/docs/topics/models/run-a-model#run-a-model-with-the-api))

**This model is booted and ready for API calls.**

Official models are always on, maintained, and have predictable pricing.

This model is priced per input token and output token. [View more.](https://replicate.com/openai/gpt-4.1-nano#pricing)

Outputs from this model can be sold or used in paid products.

Copy

Show

Copy

Copy

Show run API

Copy

Copy

Show

Copy

Copy

Show run API

Copy

Show

Copy

Copy

Copy

# Logs (86zptcwbhxrm80cphb19cy8qh4)

Succeeded

`Generated response in 1.2sec
/usr/local/lib/python3.12/site-packages/cog/server/scope.py:21: ExperimentalFeatureWarning: current_scope is an experimental internal function. It may change or be removed without warning.
warnings.warn(`