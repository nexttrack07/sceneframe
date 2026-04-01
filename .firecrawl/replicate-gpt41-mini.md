[Replicate has joined Cloudflare](https://replicate.com/blog/replicate-cloudflare)

[Playground](https://replicate.com/openai/gpt-4.1-mini) [API](https://replicate.com/openai/gpt-4.1-mini/api) [Examples](https://replicate.com/openai/gpt-4.1-mini/examples) [README](https://replicate.com/openai/gpt-4.1-mini/readme)

## Input

FormJSONNode.jsPythonHTTP

prompt
string

`Shift` \+ `Return` to add a new line

Explain this image in excruciating detail

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

![file-preview](https://replicate.delivery/pbxt/MvoFggJfmpSOBa0TiiQbvxLc0eS7u6CpH2WHaq30FZCVIvFa/test.jpg)
https://replicate.delivery/pbxt/MvoFggJfmpSOBa0TiiQbvxLc0eS7u6CpH2WHaq30FZCVIvFa/test.jpg

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

npx create-replicate --model=openai/gpt-4.1-mini

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

Run openai/gpt-4.1-mini using Replicate’s API. Check out the [model's schema](https://replicate.com/openai/gpt-4.1-mini/api/schema) for an overview of inputs and outputs.

```javascript
const input = {
  top_p: 1,
  prompt: "Explain this image in excruciating detail",
  messages: [],
  image_input: [{"value":"https://replicate.delivery/pbxt/MvoFggJfmpSOBa0TiiQbvxLc0eS7u6CpH2WHaq30FZCVIvFa/test.jpg"}],
  temperature: 1,
  system_prompt: "You are a helpful assistant.",
  presence_penalty: 0,
  frequency_penalty: 0,
  max_completion_tokens: 4096
};

for await (const event of replicate.stream("openai/gpt-4.1-mini", { input })) {
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

Run openai/gpt-4.1-mini using Replicate’s API. Check out the [model's schema](https://replicate.com/openai/gpt-4.1-mini/api/schema) for an overview of inputs and outputs.

```python
# The openai/gpt-4.1-mini model can stream output as it's running.
for event in replicate.stream(
    "openai/gpt-4.1-mini",
    input={
        "top_p": 1,
        "prompt": "Explain this image in excruciating detail",
        "messages": [],
        "image_input": [{"value":"https://replicate.delivery/pbxt/MvoFggJfmpSOBa0TiiQbvxLc0eS7u6CpH2WHaq30FZCVIvFa/test.jpg"}],
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

Run openai/gpt-4.1-mini using Replicate’s API. Check out the [model's schema](https://replicate.com/openai/gpt-4.1-mini/api/schema) for an overview of inputs and outputs.

```shell
curl -s -X POST \
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: wait" \
  -d $'{
    "input": {
      "top_p": 1,
      "prompt": "Explain this image in excruciating detail",
      "messages": [],
      "image_input": [{"value":"https://replicate.delivery/pbxt/MvoFggJfmpSOBa0TiiQbvxLc0eS7u6CpH2WHaq30FZCVIvFa/test.jpg"}],
      "temperature": 1,
      "system_prompt": "You are a helpful assistant.",
      "presence_penalty": 0,
      "frequency_penalty": 0,
      "max_completion_tokens": 4096
    }
  }' \
  https://api.replicate.com/v1/models/openai/gpt-4.1-mini/predictions
```

Copy

To learn more, take a look at [Replicate’s HTTP API reference docs](https://replicate.com/docs/reference/http).

Sign in to run this model

[Sign in with GitHub](https://replicate.com/login/github/?next=/openai/gpt-4.1-mini)

By signing in, you agree to our

[terms of service](https://replicate.com/terms) and [privacy policy](https://replicate.com/privacy)

## Output

PreviewJSON

This image depicts a digital painting of two individuals sitting on yellow chairs facing each other. The style of the artwork has a highly textured and brushstroke-rich appearance, giving it a classic oil painting effect.

The person on the left is an older man with distinctive features resembling the iconic image of Albert Einstein. He has white, wild, and voluminous hair that flows back from his head, along with a white mustache. His skin is light with detailed wrinkles, suggesting age. He wears dark aviator-style sunglasses that cover his eyes. His outfit consists of a black or dark charcoal jacket over a grey shirt. His posture is relaxed yet engaged; he is sitting with his legs crossed and his hands intertwined in front of him, leaning slightly forward as if involved in a deep conversation.

Opposite him, on the right, is a young woman also wearing sunglasses; hers are larger, black, and have a fashionable cat-eye shape. Her hair is long, light brown, and pulled back into a high ponytail secured with a black hair tie, revealing her neck and ears adorned with small pearl earrings. She wears a modern sporty outfit: a fitted black sleeveless crop top with white, red, and green horizontal stripes below the bust, showcasing her midriff, paired with high-waisted black leggings. Her makeup is notable with vivid red lipstick and subtle blush on her cheeks, enhancing her poised facial expression. Her body language is attentive, sitting upright with one arm resting on her leg, facing the man directly as if listening intently or engaged in serious discussion.

The background is muted, a gradient of soft, light greyish and beige tones with smooth texture and faint brush marks, which ensures the vibrant yellow chairs and the figures stand out prominently. The contrast between the elderly man dressed in classic, somber tones and the young woman in trendy athletic wear suggests a dialogue across generations or a fusion of intellect and modernity.

Overall, the image conveys an intimate, intense moment of exchange, blending timelessness with contemporary style, framed in a polished painterly technique that enhances the emotional depth and character of each subject.

```
{
  "completed_at": "2025-05-01T07:07:19.873587Z",
  "created_at": "2025-05-01T07:07:09.829000Z",
  "data_removed": false,
  "error": null,
  "id": "z6rf0mdggnrmc0cphans1bd6r0",
  "input": {
    "prompt": "Explain this image in excruciating detail",
    "image_input": [\
      "https://replicate.delivery/pbxt/MvoFggJfmpSOBa0TiiQbvxLc0eS7u6CpH2WHaq30FZCVIvFa/test.jpg"\
    ],
    "temperature": 1,
    "system_prompt": "You are a helpful assistant."
  },
  "logs": "Image size: 278.7KB\nGenerated response in 9.8sec\n/usr/local/lib/python3.12/site-packages/cog/server/scope.py:21: ExperimentalFeatureWarning: current_scope is an experimental internal function. It may change or be removed without warning.\n  warnings.warn(",
  "metrics": {
    "input_token_count": 1168,
    "tokens_per_second": 42.178245871307865,
    "output_token_count": 423,
    "predict_time": 10.028904587,
    "total_time": 10.044587,
    "time_to_first_token": 0.015720017000000003
  },
  "output": "This image depicts a digital painting of two individuals sitting on yellow chairs facing each other. The style of the artwork has a highly textured and brushstroke-rich appearance, giving it a classic oil painting effect.\n\nThe person on the left is an older man with distinctive features resembling the iconic image of Albert Einstein. He has white, wild, and voluminous hair that flows back from his head, along with a white mustache. His skin is light with detailed wrinkles, suggesting age. He wears dark aviator-style sunglasses that cover his eyes. His outfit consists of a black or dark charcoal jacket over a grey shirt. His posture is relaxed yet engaged; he is sitting with his legs crossed and his hands intertwined in front of him, leaning slightly forward as if involved in a deep conversation.\n\nOpposite him, on the right, is a young woman also wearing sunglasses; hers are larger, black, and have a fashionable cat-eye shape. Her hair is long, light brown, and pulled back into a high ponytail secured with a black hair tie, revealing her neck and ears adorned with small pearl earrings. She wears a modern sporty outfit: a fitted black sleeveless crop top with white, red, and green horizontal stripes below the bust, showcasing her midriff, paired with high-waisted black leggings. Her makeup is notable with vivid red lipstick and subtle blush on her cheeks, enhancing her poised facial expression. Her body language is attentive, sitting upright with one arm resting on her leg, facing the man directly as if listening intently or engaged in serious discussion.\n\nThe background is muted, a gradient of soft, light greyish and beige tones with smooth texture and faint brush marks, which ensures the vibrant yellow chairs and the figures stand out prominently. The contrast between the elderly man dressed in classic, somber tones and the young woman in trendy athletic wear suggests a dialogue across generations or a fusion of intellect and modernity.\n\nOverall, the image conveys an intimate, intense moment of exchange, blending timelessness with contemporary style, framed in a polished painterly technique that enhances the emotional depth and character of each subject.",
  "started_at": "2025-05-01T07:07:09.844682Z",
  "status": "succeeded",
  "urls": {
    "get": "https://api.replicate.com/v1/predictions/z6rf0mdggnrmc0cphans1bd6r0",
    "cancel": "https://api.replicate.com/v1/predictions/z6rf0mdggnrmc0cphans1bd6r0/cancel"
  },
  "version": "hidden"
}
```

Copy

Generated in

10.0 seconds

Input tokens

1.1K

Output tokens

420

Tokens per second

42.18 tokens / second

Time to first token

16 milliseconds

[Tweak it](https://replicate.com/openai/gpt-4.1-mini?prediction=z6rf0mdggnrmc0cphans1bd6r0) [Iterate in playground](https://replicate.com/playground?model=openai/gpt-4.1-mini&inputs=%7B%22prompt%22%3A%22Explain%20this%20image%20in%20excruciating%20detail%22%2C%22image_input%22%3A%5B%22https%3A%2F%2Freplicate.delivery%2Fpbxt%2FMvoFggJfmpSOBa0TiiQbvxLc0eS7u6CpH2WHaq30FZCVIvFa%2Ftest.jpg%22%5D%2C%22temperature%22%3A1%2C%22system_prompt%22%3A%22You%20are%20a%20helpful%20assistant.%22%7D) [Share](https://replicate.com/signin?next=https://replicate.com/openai/gpt-4.1-mini) [Report](https://replicate.com/p/z6rf0mdggnrmc0cphans1bd6r0/report) [View full prediction](https://replicate.com/p/z6rf0mdggnrmc0cphans1bd6r0)

Show logs

`Image size: 278.7KB
Generated response in 9.8sec
/usr/local/lib/python3.12/site-packages/cog/server/scope.py:21: ExperimentalFeatureWarning: current_scope is an experimental internal function. It may change or be removed without warning.
warnings.warn(`

Copy logsFullscreen logsDownload logs

#### Pricing

$1.60

per million output tokens

or 625,000 tokens for $1

$0.40

per million input tokens

or 2,500,000 tokens for $1

[Check out our docs](https://replicate.com/docs/billing) for more information about how pricing works on Replicate. Looking for volume pricing? [Get in touch](mailto:sales@replicate.com).

## Readme

**GPT‑4.1 mini** is a compact, high-performance model designed for real-world applications that require fast response times and low cost—without sacrificing intelligence. It delivers performance competitive with GPT‑4o while cutting latency nearly in half and reducing cost by 83%.

## Key Features

- Fast and lightweight, ideal for latency-sensitive use cases
- High accuracy across coding, reasoning, and instruction following
- Supports 1 million token context windows
- Cost-effective for large-scale deployments
- Reliable for long-context and format-specific tasks

## Benchmark Highlights

- SWE-bench Verified (coding): 24%
- MultiChallenge (instruction following): 36%
- IFEval (format compliance): 84%
- Aider Diff Format Accuracy (diff): 45%
- MMMU (vision QA): 73%

## Use Cases

- Chatbots and assistants
- Lightweight code generation and review
- Document Q&A and summarization
- Image reasoning
- High-volume, cost-sensitive tasks

## Notes

- Available via the OpenAI API
- Not currently available in ChatGPT
- Supports up to 1 million tokens of context

Model created
10 months, 4 weeks ago


Model updated
2 months, 1 week ago


## Related models

[![gpt-5-nano](https://tjzk.replicate.delivery/models_models_cover_image/fbb1068e-ae55-4d4f-9ee8-3e3da859f69f/Screenshot_2025-08-07_at_1.04.57P.png)\\
\\
**openai/gpt-5-nano** \\
\\
Generate text and code from prompts and chat messages with fast, low-cost responses. Accept optional image inputs to caption images, answer visual questions, and analyze screenshots, documents, charts, and photos, returning text outputs. Support instruction following, question answering, code generation and refactoring, code understanding, text translation, document summarization, data extraction, classification, and data analysis. Provide controls for reasoning depth (minimal, low, medium, high) to trade latency for thoroughness, and verbosity (low, medium, high) to constrain output length. Support system prompts and multi-turn chat.\\
\\
3.9m runs\\
\\
Official](https://replicate.com/openai/gpt-5-nano "openai/gpt-5-nano: Generate text and code from prompts and chat messages with fast, low-cost responses. Accept optional image inputs to caption images, answer visual questions, and analyze screenshots, documents, charts, and photos, returning text outputs. Support instruction following, question answering, code generation and refactoring, code understanding, text translation, document summarization, data extraction, classification, and data analysis. Provide controls for reasoning depth (minimal, low, medium, high) to trade latency for thoroughness, and verbosity (low, medium, high) to constrain output length. Support system prompts and multi-turn chat.") [![gpt-5-mini](https://tjzk.replicate.delivery/models_models_featured_image/518903fa-a7de-4876-a79e-aac7fdeae577/Screenshot_2025-08-07_at_1.04..png)\\
\\
**openai/gpt-5-mini** \\
\\
Generate and reason over text and images for chat, coding, translation, and analysis. Accept a single text prompt or chat-style messages with an optional system prompt, and optionally include one or more images for multimodal understanding (captioning, visual Q&A, extraction); returns text. Control response behavior with reasoning\_effort (minimal, low, medium, high) to trade depth of reasoning for latency/cost, and verbosity (low, medium, high) to set concise vs detailed outputs. Use for question answering, code generation and explanation, SQL, summarization, information extraction, classification, and step-by-step problem solving. Optimized for speed and cost relative to GPT-5, well-suited for interactive chat and medium-difficulty reasoning.\\
\\
775.8k runs\\
\\
Official](https://replicate.com/openai/gpt-5-mini "openai/gpt-5-mini: Generate and reason over text and images for chat, coding, translation, and analysis. Accept a single text prompt or chat-style messages with an optional system prompt, and optionally include one or more images for multimodal understanding (captioning, visual Q&A, extraction); returns text. Control response behavior with reasoning_effort (minimal, low, medium, high) to trade depth of reasoning for latency/cost, and verbosity (low, medium, high) to set concise vs detailed outputs. Use for question answering, code generation and explanation, SQL, summarization, information extraction, classification, and step-by-step problem solving. Optimized for speed and cost relative to GPT-5, well-suited for interactive chat and medium-difficulty reasoning.") [![gpt-4o-mini](https://tjzk.replicate.delivery/models_models_cover_image/274e635d-c3e7-4d26-919a-43d5f1431b00/Screenshot_2025-05-14_at_8.21.53P.png)\\
\\
**openai/gpt-4o-mini** \\
\\
Generate and chat in natural language from text prompts, with optional image inputs for visual understanding and image-to-text tasks. Handle question-answering, code generation and explanation, text translation, document summarization, data analysis, and information extraction. Accept single prompts or multi-turn chat messages with a system prompt, and support temperature, top\_p, and repetition penalties for control. Return long-form text outputs (up to roughly 4k tokens) with low latency and low cost.\\
\\
3.6m runs\\
\\
Official](https://replicate.com/openai/gpt-4o-mini "openai/gpt-4o-mini: Generate and chat in natural language from text prompts, with optional image inputs for visual understanding and image-to-text tasks. Handle question-answering, code generation and explanation, text translation, document summarization, data analysis, and information extraction. Accept single prompts or multi-turn chat messages with a system prompt, and support temperature, top_p, and repetition penalties for control. Return long-form text outputs (up to roughly 4k tokens) with low latency and low cost.") [![gpt-5](https://tjzk.replicate.delivery/models_models_featured_image/93d32638-644c-4926-8d07-ad01eec112fb/gpt-5-sm.jpg)\\
\\
**openai/gpt-5** \\
\\
Generate and reason over text for coding, question answering, and multi-step problem solving. Accepts text prompts or chat messages and optional images, and returns text. Perform code generation, debugging, code review, and refactoring; text translation; document summarization; data analysis; planning; and instruction following. Analyze images for captioning, visual question answering, and content extraction. Control behavior with reasoning\_effort (minimal, medium, high) to trade depth for latency and verbosity (low, medium, high) for output length, with system prompts and multi-turn chat. Constrain outputs to specific formats using grammars (CFGs) for tool/API integration, and reuse reasoning across turns for more consistent agentic workflows.\\
\\
997.0k runs\\
\\
Official](https://replicate.com/openai/gpt-5 "openai/gpt-5: Generate and reason over text for coding, question answering, and multi-step problem solving. Accepts text prompts or chat messages and optional images, and returns text. Perform code generation, debugging, code review, and refactoring; text translation; document summarization; data analysis; planning; and instruction following. Analyze images for captioning, visual question answering, and content extraction. Control behavior with reasoning_effort (minimal, medium, high) to trade depth for latency and verbosity (low, medium, high) for output length, with system prompts and multi-turn chat. Constrain outputs to specific formats using grammars (CFGs) for tool/API integration, and reuse reasoning across turns for more consistent agentic workflows.") [![gpt-4.1-nano](https://tjzk.replicate.delivery/models_models_featured_image/f2c12cca-5859-407a-9189-0509526e4757/Screenshot_2025-05-01_at_12.29.png)\\
\\
**openai/gpt-4.1-nano** \\
\\
Generate and classify text from prompts or chat messages with ultra-low latency and up to a 1M-token context window. Accept optional images to perform captioning and basic visual understanding, returning text outputs. Use for autocomplete, structured text generation, fast question answering, text classification, simple reasoning, summarization, translation, data extraction, and lightweight code generation/code understanding in speed- and budget-sensitive, high-throughput applications.\\
\\
1.0m runs\\
\\
Official](https://replicate.com/openai/gpt-4.1-nano "openai/gpt-4.1-nano: Generate and classify text from prompts or chat messages with ultra-low latency and up to a 1M-token context window. Accept optional images to perform captioning and basic visual understanding, returning text outputs. Use for autocomplete, structured text generation, fast question answering, text classification, simple reasoning, summarization, translation, data extraction, and lightweight code generation/code understanding in speed- and budget-sensitive, high-throughput applications.") [![gpt-4.1](https://tjzk.replicate.delivery/models_models_featured_image/8dbaab0b-d3e7-4bae-8772-d7e1f879d537/gpt-4.1.webp)\\
\\
**openai/gpt-4.1** \\
\\
Generate and reason over text and code with up to a 1M-token context, and analyze images to produce text answers, captions, and explanations. Accepts prompts or chat messages plus optional image inputs; returns text. Handle long documents and codebases, perform code generation and code understanding (including diffs), follow structured instructions with high formatting fidelity, and support agentic workflows and long-context reasoning. Execute question answering, document summarization, data extraction, text translation, and structured content generation. Provide visual understanding for images, charts, and diagrams. Knowledge cutoff: June 2024; supports up to 32,768 output tokens.\\
\\
274.4k runs\\
\\
Official](https://replicate.com/openai/gpt-4.1 "openai/gpt-4.1: Generate and reason over text and code with up to a 1M-token context, and analyze images to produce text answers, captions, and explanations. Accepts prompts or chat messages plus optional image inputs; returns text. Handle long documents and codebases, perform code generation and code understanding (including diffs), follow structured instructions with high formatting fidelity, and support agentic workflows and long-context reasoning. Execute question answering, document summarization, data extraction, text translation, and structured content generation. Provide visual understanding for images, charts, and diagrams. Knowledge cutoff: June 2024; supports up to 32,768 output tokens.") [![gpt-4o](https://tjzk.replicate.delivery/models_models_cover_image/c0841fcc-b236-4634-8f13-65627b2d5af6/Screenshot_2025-05-18_at_1.14.36.webp)\\
\\
**openai/gpt-4o** \\
\\
Chat with a multimodal large language model using text and optional images as input and receive streamed text outputs. Generate and edit text, write and debug code, perform reasoning and math, answer questions, translate, summarize documents, and extract structured information. Analyze images for captioning, OCR, chart/table interpretation, and multimodal document Q&A, combining text and vision in a single call. Streams tokens for low-latency interaction.\\
\\
363.3k runs\\
\\
Official](https://replicate.com/openai/gpt-4o "openai/gpt-4o: Chat with a multimodal large language model using text and optional images as input and receive streamed text outputs. Generate and edit text, write and debug code, perform reasoning and math, answer questions, translate, summarize documents, and extract structured information. Analyze images for captioning, OCR, chart/table interpretation, and multimodal document Q&A, combining text and vision in a single call. Streams tokens for low-latency interaction.") [![o4-mini](https://tjzk.replicate.delivery/models_models_featured_image/f01a4135-119e-4257-80db-bb7a3e5e29bb/Screenshot_2025-05-01_at_2.49..png)\\
\\
**openai/o4-mini** \\
\\
Answer questions, write code, and analyze images with a fast, cost‑efficient reasoning model. Accept a single prompt or chat-style messages plus optional multiple images; output text. Control depth and speed with reasoning\_effort (low/medium/high), set behavior via a system prompt, and generate long responses (up to 4096 completion tokens). Tackle math problem solving with step-by-step reasoning, code generation and debugging, data analysis, document understanding and summarization, factual question answering, and text translation. Perform visual understanding on images, including diagram/chart interpretation and general image-to-text description. Suited for real-time assistants and high-throughput workflows with low latency.\\
\\
385.5k runs\\
\\
Official](https://replicate.com/openai/o4-mini "openai/o4-mini: Answer questions, write code, and analyze images with a fast, cost‑efficient reasoning model. Accept a single prompt or chat-style messages plus optional multiple images; output text. Control depth and speed with reasoning_effort (low/medium/high), set behavior via a system prompt, and generate long responses (up to 4096 completion tokens). Tackle math problem solving with step-by-step reasoning, code generation and debugging, data analysis, document understanding and summarization, factual question answering, and text translation. Perform visual understanding on images, including diagram/chart interpretation and general image-to-text description. Suited for real-time assistants and high-throughput workflows with low latency.")

Copy model identifier (for use with [replicate.run](https://replicate.com/docs/topics/models/run-a-model#run-a-model-with-the-api))

**This model is booted and ready for API calls.**

Official models are always on, maintained, and have predictable pricing.

This model is priced per input token and output token. [View more.](https://replicate.com/openai/gpt-4.1-mini#pricing)

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

# Logs (z6rf0mdggnrmc0cphans1bd6r0)

Succeeded

`Image size: 278.7KB
Generated response in 9.8sec
/usr/local/lib/python3.12/site-packages/cog/server/scope.py:21: ExperimentalFeatureWarning: current_scope is an experimental internal function. It may change or be removed without warning.
warnings.warn(`