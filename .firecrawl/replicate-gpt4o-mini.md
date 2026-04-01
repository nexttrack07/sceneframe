[Replicate has joined Cloudflare](https://replicate.com/blog/replicate-cloudflare)

[Playground](https://replicate.com/openai/gpt-4o-mini) [API](https://replicate.com/openai/gpt-4o-mini/api) [Examples](https://replicate.com/openai/gpt-4o-mini/examples) [README](https://replicate.com/openai/gpt-4o-mini/readme)

## Input

FormJSONNode.jsPythonHTTP

prompt
string

`Shift` \+ `Return` to add a new line

My situationship is starting to cross over into more than "friends with benefits" territory. I'm catching feelings, but this is not in my five year plan. What should I do?

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

npx create-replicate --model=openai/gpt-4o-mini

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

Run openai/gpt-4o-mini using Replicate’s API. Check out the [model's schema](https://replicate.com/openai/gpt-4o-mini/api/schema) for an overview of inputs and outputs.

```javascript
const input = {
  top_p: 1,
  prompt: "My situationship is starting to cross over into more than \"friends with benefits\" territory. I'm catching feelings, but this is not in my five year plan. What should I do?",
  messages: [],
  image_input: [],
  temperature: 1,
  system_prompt: "You are a helpful assistant.",
  presence_penalty: 0,
  frequency_penalty: 0,
  max_completion_tokens: 4096
};

for await (const event of replicate.stream("openai/gpt-4o-mini", { input })) {
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

Run openai/gpt-4o-mini using Replicate’s API. Check out the [model's schema](https://replicate.com/openai/gpt-4o-mini/api/schema) for an overview of inputs and outputs.

```python
# The openai/gpt-4o-mini model can stream output as it's running.
for event in replicate.stream(
    "openai/gpt-4o-mini",
    input={
        "top_p": 1,
        "prompt": "My situationship is starting to cross over into more than \"friends with benefits\" territory. I'm catching feelings, but this is not in my five year plan. What should I do?",
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

Run openai/gpt-4o-mini using Replicate’s API. Check out the [model's schema](https://replicate.com/openai/gpt-4o-mini/api/schema) for an overview of inputs and outputs.

```shell
curl -s -X POST \
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: wait" \
  -d $'{
    "input": {
      "top_p": 1,
      "prompt": "My situationship is starting to cross over into more than \\"friends with benefits\\" territory. I\'m catching feelings, but this is not in my five year plan. What should I do?",
      "messages": [],
      "image_input": [],
      "temperature": 1,
      "system_prompt": "You are a helpful assistant.",
      "presence_penalty": 0,
      "frequency_penalty": 0,
      "max_completion_tokens": 4096
    }
  }' \
  https://api.replicate.com/v1/models/openai/gpt-4o-mini/predictions
```

Copy

To learn more, take a look at [Replicate’s HTTP API reference docs](https://replicate.com/docs/reference/http).

Sign in to run this model

[Sign in with GitHub](https://replicate.com/login/github/?next=/openai/gpt-4o-mini)

By signing in, you agree to our

[terms of service](https://replicate.com/terms) and [privacy policy](https://replicate.com/privacy)

## Output

PreviewJSON

Navigating a situationship can be challenging, especially when feelings begin to develop. Here are some steps you can take to handle the situation:

1\. \*\*Reflect on Your Feelings\*\*: Take some time to understand your emotions. Why are you catching feelings? Is it because of the connection you have, or is it more about wanting something deeper? Understanding your feelings can help you make a clearer decision.

2\. \*\*Consider Your Goals\*\*: Since you mentioned this isn’t part of your five-year plan, think about what that means for you. What are your priorities right now? Are you willing to reconsider your goals, or do you want to stick to them?

3\. \*\*Communicate Openly\*\*: If you feel comfortable, consider having an honest conversation with the other person. Share your feelings and your perspective on the situation. Communication is key in any relationship, especially when emotions are involved.

4\. \*\*Set Boundaries\*\*: If you prefer to maintain the "friends with benefits" aspect, it might be helpful to set some boundaries to avoid getting too emotionally invested. Clearly defining the relationship can help both of you understand what's expected.

5\. \*\*Evaluate the Other Person's Feelings\*\*: Try to gauge how the other person feels about the situation. Are they also developing feelings, or are they content with keeping things casual? Their feelings will heavily influence how you should proceed.

6\. \*\*Plan for Different Outcomes\*\*: If you talk and find that both of you are on the same page, you might decide to explore a deeper relationship. If not, you need to consider if you're comfortable continuing as is or if it’s better to distance yourself.

7\. \*\*Prioritize Self-Care\*\*: Regardless of how you decide to move forward, make sure to take care of yourself emotionally. It's okay to feel conflicted, and processing those feelings is essential.

Remember, it’s perfectly okay to prioritize your goals and values. If you find that your feelings could lead to complications you’re not prepared for, it might be best to reassess the connection.

```
{
  "completed_at": "2025-05-15T03:18:26.212592Z",
  "created_at": "2025-05-15T03:18:15.041000Z",
  "data_removed": false,
  "error": null,
  "id": "0hh1enh505rm80cpt7svg69gj8",
  "input": {
    "top_p": 1,
    "prompt": "My situationship is starting to cross over into more than \"friends with benefits\" territory. I'm catching feelings, but this is not in my five year plan. What should I do?",
    "messages": [],
    "image_input": [],
    "temperature": 1,
    "system_prompt": "You are a helpful assistant.",
    "presence_penalty": 0,
    "frequency_penalty": 0,
    "max_completion_tokens": 4096
  },
  "logs": "Processing 0 images\nRequest data: {'model': 'gpt-4o-mini', 'messages': [{'role': 'system', 'content': 'You are a helpful assistant.'}, {'role': 'user', 'content': [{'type': 'text', 'text': 'My situationship is starting to cross over into more than \"friends with benefits\" territory. I\\'m catching feelings, but this is not in my five year plan. What should I do?'}]}], 'temperature': 1.0, 'max_completion_tokens': 4096, 'top_p': 1.0, 'frequency_penalty': 0.0, 'presence_penalty': 0.0}\nGenerated response in 7.2sec\n  warnings.warn(",
  "metrics": {
    "predict_time": 7.233909219,
    "total_time": 11.171592
  },
  "output": "Navigating a situationship can be challenging, especially when feelings begin to develop. Here are some steps you can take to handle the situation:\n\n1. **Reflect on Your Feelings**: Take some time to understand your emotions. Why are you catching feelings? Is it because of the connection you have, or is it more about wanting something deeper? Understanding your feelings can help you make a clearer decision.\n\n2. **Consider Your Goals**: Since you mentioned this isn’t part of your five-year plan, think about what that means for you. What are your priorities right now? Are you willing to reconsider your goals, or do you want to stick to them?\n\n3. **Communicate Openly**: If you feel comfortable, consider having an honest conversation with the other person. Share your feelings and your perspective on the situation. Communication is key in any relationship, especially when emotions are involved.\n\n4. **Set Boundaries**: If you prefer to maintain the \"friends with benefits\" aspect, it might be helpful to set some boundaries to avoid getting too emotionally invested. Clearly defining the relationship can help both of you understand what's expected.\n\n5. **Evaluate the Other Person's Feelings**: Try to gauge how the other person feels about the situation. Are they also developing feelings, or are they content with keeping things casual? Their feelings will heavily influence how you should proceed.\n\n6. **Plan for Different Outcomes**: If you talk and find that both of you are on the same page, you might decide to explore a deeper relationship. If not, you need to consider if you're comfortable continuing as is or if it’s better to distance yourself.\n\n7. **Prioritize Self-Care**: Regardless of how you decide to move forward, make sure to take care of yourself emotionally. It's okay to feel conflicted, and processing those feelings is essential.\n\nRemember, it’s perfectly okay to prioritize your goals and values. If you find that your feelings could lead to complications you’re not prepared for, it might be best to reassess the connection.",
  "started_at": "2025-05-15T03:18:18.978683Z",
  "status": "succeeded",
  "urls": {
    "get": "https://api.replicate.com/v1/predictions/0hh1enh505rm80cpt7svg69gj8",
    "cancel": "https://api.replicate.com/v1/predictions/0hh1enh505rm80cpt7svg69gj8/cancel"
  },
  "version": "2c0a6a34916017ceafaaf5fdf63f9370cf9491866a9611f37d86138c8ef53fc6"
}
```

Copy

Generated in

7.2 seconds

[Tweak it](https://replicate.com/openai/gpt-4o-mini/versions/2c0a6a34916017ceafaaf5fdf63f9370cf9491866a9611f37d86138c8ef53fc6?prediction=0hh1enh505rm80cpt7svg69gj8) [Iterate in playground](https://replicate.com/playground?model=openai/gpt-4o-mini&inputs=%7B%22top_p%22%3A1%2C%22prompt%22%3A%22My%20situationship%20is%20starting%20to%20cross%20over%20into%20more%20than%20%5C%22friends%20with%20benefits%5C%22%20territory.%20I%27m%20catching%20feelings%2C%20but%20this%20is%20not%20in%20my%20five%20year%20plan.%20What%20should%20I%20do%3F%22%2C%22messages%22%3A%5B%5D%2C%22image_input%22%3A%5B%5D%2C%22temperature%22%3A1%2C%22system_prompt%22%3A%22You%20are%20a%20helpful%20assistant.%22%2C%22presence_penalty%22%3A0%2C%22frequency_penalty%22%3A0%2C%22max_completion_tokens%22%3A4096%7D) [Share](https://replicate.com/signin?next=https://replicate.com/openai/gpt-4o-mini) [Report](https://replicate.com/p/0hh1enh505rm80cpt7svg69gj8/report) [View full prediction](https://replicate.com/p/0hh1enh505rm80cpt7svg69gj8)

Show logs

`Processing 0 images
Request data: {'model': 'gpt-4o-mini', 'messages': [{'role': 'system', 'content': 'You are a helpful assistant.'}, {'role': 'user', 'content': [{'type': 'text', 'text': 'My situationship is starting to cross over into more than "friends with benefits" territory. I\'m catching feelings, but this is not in my five year plan. What should I do?'}]}], 'temperature': 1.0, 'max_completion_tokens': 4096, 'top_p': 1.0, 'frequency_penalty': 0.0, 'presence_penalty': 0.0}
Generated response in 7.2sec
warnings.warn(`

Copy logsFullscreen logsDownload logs

#### Pricing

$0.60

per million output tokens

or around 1,666,666 tokens for $1

$0.15

per million input tokens

or around 6,666,666 tokens for $1

[Check out our docs](https://replicate.com/docs/billing) for more information about how pricing works on Replicate. Looking for volume pricing? [Get in touch](mailto:sales@replicate.com).

## Readme

This model doesn't have a readme.


Model created
10 months, 2 weeks ago


Model updated
7 months, 2 weeks ago


Copy model identifier (for use with [replicate.run](https://replicate.com/docs/topics/models/run-a-model#run-a-model-with-the-api))

**This model is booted and ready for API calls.**

Official models are always on, maintained, and have predictable pricing.

This model is priced per input token and output token. [View more.](https://replicate.com/openai/gpt-4o-mini#pricing)

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

# Logs (0hh1enh505rm80cpt7svg69gj8)

Succeeded

`Processing 0 images
Request data: {'model': 'gpt-4o-mini', 'messages': [{'role': 'system', 'content': 'You are a helpful assistant.'}, {'role': 'user', 'content': [{'type': 'text', 'text': 'My situationship is starting to cross over into more than "friends with benefits" territory. I\'m catching feelings, but this is not in my five year plan. What should I do?'}]}], 'temperature': 1.0, 'max_completion_tokens': 4096, 'top_p': 1.0, 'frequency_penalty': 0.0, 'presence_penalty': 0.0}
Generated response in 7.2sec
warnings.warn(`