[Replicate has joined Cloudflare](https://replicate.com/blog/replicate-cloudflare)

[Playground](https://replicate.com/google/gemini-2.5-flash) [API](https://replicate.com/google/gemini-2.5-flash/api) [Examples](https://replicate.com/google/gemini-2.5-flash/examples) [README](https://replicate.com/google/gemini-2.5-flash/readme)

## Input

FormJSONNode.jsPythonHTTP

prompt
\*string

`Shift` \+ `Return` to add a new line

describe this image in detail

The text prompt to send to the model

images
file\[\]

Add multiple files

![file-preview](https://replicate.delivery/pbxt/O1TXLIqsDC7pdOzMl259hqrdwkDLjxrf8Fsg2ZwYVIIkoHkm/replicate-prediction-vygd5qqab1rmc0ctb9cbr14cxw.jpg)
https://replicate.delivery/pbxt/O1TXLIqsDC7pdOzMl259hqrdwkDLjxrf8Fsg2ZwYVIIkoHkm/replicate-prediction-vygd5qqab1rmc0ctb9cbr14cxw.jpg

To pick up a draggable item, press the space bar.
While dragging, use the arrow keys to move the item.
Press space again to drop the item in its new position, or press escape to cancel.


Input images to send with the prompt (max 10 images, each up to 7MB)

Default: \[\]

videos
file\[\]

Add multiple files

To pick up a draggable item, press the space bar.
While dragging, use the arrow keys to move the item.
Press space again to drop the item in its new position, or press escape to cancel.


Input videos to send with the prompt (max 10 videos, each up to 45 minutes)

Default: \[\]

dynamic\_thinking
boolean

Enable dynamic thinking - the model will adjust the thinking budget based on the complexity of the request (overrides thinking\_budget parameter)

Default: false

Show advanced inputs

Including system\_instructionand 4 more...

system\_instruction
string

`Shift` \+ `Return` to add a new line

System instruction to guide the model's behavior

temperature
number

(minimum: 0, maximum: 2)

temperature

Sampling temperature between 0 and 2

Default: 1

top\_p
number

(minimum: 0, maximum: 1)

top\_p

Nucleus sampling parameter - the model considers the results of the tokens with top\_p probability mass

Default: 0.95

max\_output\_tokens
integer

(minimum: 1, maximum: 65535)

max\_output\_tokens

Maximum number of tokens to generate

Default: 65535

thinking\_budget
integer

(minimum: 0, maximum: 24576)

thinking\_budget

Thinking budget for reasoning (0 to disable thinking, higher values allow more reasoning)

Run this model in Node.js with [one line of code](https://replicate.com/docs/get-started/nodejs#quickstart-scaffold-a-project-with-a-one-liner):

npx create-replicate --model=google/gemini-2.5-flash

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

Run google/gemini-2.5-flash using Replicate’s API. Check out the [model's schema](https://replicate.com/google/gemini-2.5-flash/api/schema) for an overview of inputs and outputs.

```javascript
const input = {
  top_p: 0.95,
  images: [{"value":"https://replicate.delivery/pbxt/O1TXLIqsDC7pdOzMl259hqrdwkDLjxrf8Fsg2ZwYVIIkoHkm/replicate-prediction-vygd5qqab1rmc0ctb9cbr14cxw.jpg"}],
  prompt: "describe this image in detail",
  videos: [],
  temperature: 1,
  dynamic_thinking: false,
  max_output_tokens: 65535
};

for await (const event of replicate.stream("google/gemini-2.5-flash", { input })) {
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

Run google/gemini-2.5-flash using Replicate’s API. Check out the [model's schema](https://replicate.com/google/gemini-2.5-flash/api/schema) for an overview of inputs and outputs.

```python
# The google/gemini-2.5-flash model can stream output as it's running.
for event in replicate.stream(
    "google/gemini-2.5-flash",
    input={
        "top_p": 0.95,
        "images": [{"value":"https://replicate.delivery/pbxt/O1TXLIqsDC7pdOzMl259hqrdwkDLjxrf8Fsg2ZwYVIIkoHkm/replicate-prediction-vygd5qqab1rmc0ctb9cbr14cxw.jpg"}],
        "prompt": "describe this image in detail",
        "videos": [],
        "temperature": 1,
        "dynamic_thinking": False,
        "max_output_tokens": 65535
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

Run google/gemini-2.5-flash using Replicate’s API. Check out the [model's schema](https://replicate.com/google/gemini-2.5-flash/api/schema) for an overview of inputs and outputs.

```shell
curl -s -X POST \
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: wait" \
  -d $'{
    "input": {
      "top_p": 0.95,
      "images": [{"value":"https://replicate.delivery/pbxt/O1TXLIqsDC7pdOzMl259hqrdwkDLjxrf8Fsg2ZwYVIIkoHkm/replicate-prediction-vygd5qqab1rmc0ctb9cbr14cxw.jpg"}],
      "prompt": "describe this image in detail",
      "videos": [],
      "temperature": 1,
      "dynamic_thinking": false,
      "max_output_tokens": 65535
    }
  }' \
  https://api.replicate.com/v1/models/google/gemini-2.5-flash/predictions
```

Copy

To learn more, take a look at [Replicate’s HTTP API reference docs](https://replicate.com/docs/reference/http).

Reset to default inputsRun `(ctrl+enter)`

## Output

PreviewJSON

This stunning image depicts a solitary samurai warrior in a moment of deep contemplation amidst a breathtaking autumn mountain landscape, rendered in a style reminiscent of classical painting with a touch of modern digital artistry.

In the foreground, slightly to the left of center, a samurai is seated on a rugged, dark gray and brown rocky outcrop. He is in a contemplative or meditative posture, with his head bowed and gaze directed downwards. His hands are clasped or resting gently in his lap.

The samurai's armor is remarkably ornate and colorful. He wears a regal purple kabuto (helmet) with golden, horn-like kuwagata crests on the front, adorned with intricate golden details. His face is obscured by a dark blue or black mask (mempo), with subtle red accents around what appears to be the mouth or chin guard. The body armor consists of white or cream-colored sections with delicate, intricate purple patterns, possibly depicting floral motifs, clouds, or traditional Japanese designs. These patterned sections are interspersed with solid purple plates, all appearing to be meticulously lacquered and held together with visible lacing. A katana, sheathed in a dark scabbard, rests at his left hip.

Dominating the left and upper-middle sections of the image is a gnarled, ancient tree branch, its dark, textured bark contrasting with its vibrant foliage. The leaves are a magnificent tapestry of autumn colors: fiery reds, rich oranges, and brilliant yellows, suggesting a maple or similar deciduous tree. The individual leaves are highly detailed, showing veins and variations in color, and are clustered densely on the branches, some smaller twigs extending with nascent buds or berries.

The background unfolds into a majestic mountain range. Several layers of peaks fade into the distance, rendered with atmospheric perspective, appearing progressively lighter blue and hazier. The most prominent feature in the background is a towering, sharp, snow-capped mountain peak on the far right, its pristine white snow standing out against the pale, almost white or light blue sky.

The overall color palette is a striking blend of vibrant autumn hues (reds, oranges, yellows) in the foliage, deep purples, whites, and dark blues of the samurai's armor, and the cool blues, grays, and whites of the distant mountains and sky. The lighting is soft and diffused, creating a serene and introspective mood. The image evokes a sense of peace, resilience, and the beauty of nature, with the samurai serving as a stoic, reflective presence within the grand landscape.

```
{
  "completed_at": "2025-11-07T22:18:49.856645Z",
  "created_at": "2025-11-07T22:18:39.205000Z",
  "data_removed": false,
  "error": null,
  "id": "94p6hekpwnrme0ctc1kb2c6j18",
  "input": {
    "top_p": 0.95,
    "images": [\
      "https://replicate.delivery/pbxt/O1TXLIqsDC7pdOzMl259hqrdwkDLjxrf8Fsg2ZwYVIIkoHkm/replicate-prediction-vygd5qqab1rmc0ctb9cbr14cxw.jpg"\
    ],
    "prompt": "describe this image in detail",
    "videos": [],
    "temperature": 1,
    "dynamic_thinking": false,
    "max_output_tokens": 65535
  },
  "logs": "Generating text with gemini-2.5-flash...\nProcessing 1 images...\nText generation completed in 10.57s\nInput token count: 263\nOutput token count: 515",
  "metrics": {
    "predict_time": 10.632517002,
    "total_time": 10.651645905
  },
  "output": [\
    "This stunning image depicts a solitary samurai warrior in a moment of deep contemplation amidst a breathtaking autumn mountain landscape, rendered in a style reminiscent of classical painting with a touch of modern digital artistry.\n\nIn the foreground, slightly to the left of center",\
    ", a samurai is seated on a rugged, dark gray and brown rocky outcrop. He is in a contemplative or meditative posture, with his head bowed and gaze directed downwards. His hands are clasped or resting gently in his lap.\n\nThe",\
    " samurai's armor is remarkably ornate and colorful. He wears a regal purple kabuto (helmet) with golden, horn-like kuwagata crests on the front, adorned with intricate golden details. His face is obscured by a dark blue",\
    " or black mask (mempo), with subtle red accents around what appears to be the mouth or chin guard. The body armor consists of white or cream-colored sections with delicate, intricate purple patterns, possibly depicting floral motifs, clouds, or traditional",\
    " Japanese designs. These patterned sections are interspersed with solid purple plates, all appearing to be meticulously lacquered and held together with visible lacing. A katana, sheathed in a dark scabbard, rests at his left hip.\n\nDomin",\
    "ating the left and upper-middle sections of the image is a gnarled, ancient tree branch, its dark, textured bark contrasting with its vibrant foliage. The leaves are a magnificent tapestry of autumn colors: fiery reds, rich oranges, and",\
    " brilliant yellows, suggesting a maple or similar deciduous tree. The individual leaves are highly detailed, showing veins and variations in color, and are clustered densely on the branches, some smaller twigs extending with nascent buds or berries.\n\nThe background unfolds into a majestic",\
    " mountain range. Several layers of peaks fade into the distance, rendered with atmospheric perspective, appearing progressively lighter blue and hazier. The most prominent feature in the background is a towering, sharp, snow-capped mountain peak on the far right, its",\
    " pristine white snow standing out against the pale, almost white or light blue sky.\n\nThe overall color palette is a striking blend of vibrant autumn hues (reds, oranges, yellows) in the foliage, deep purples, whites, and dark",\
    " blues of the samurai's armor, and the cool blues, grays, and whites of the distant mountains and sky. The lighting is soft and diffused, creating a serene and introspective mood. The image evokes a sense of peace, resilience",\
    ", and the beauty of nature, with the samurai serving as a stoic, reflective presence within the grand landscape."\
  ],
  "started_at": "2025-11-07T22:18:39.224128Z",
  "status": "succeeded",
  "urls": {
    "stream": "https://stream-b.svc.ric1.c.replicate.net/v1/streams/vaeno3zudg5iyhmfooktxndfl6qifyogio6e4677foex2hpl3i4a",
    "get": "https://api.replicate.com/v1/predictions/94p6hekpwnrme0ctc1kb2c6j18",
    "cancel": "https://api.replicate.com/v1/predictions/94p6hekpwnrme0ctc1kb2c6j18/cancel"
  },
  "version": "hidden"
}
```

Copy

Generated in

10.6 seconds

[Tweak it](https://replicate.com/google/gemini-2.5-flash?prediction=94p6hekpwnrme0ctc1kb2c6j18) [Iterate in playground](https://replicate.com/playground?model=google/gemini-2.5-flash&inputs=%7B%22top_p%22%3A0.95%2C%22images%22%3A%5B%22https%3A%2F%2Freplicate.delivery%2Fpbxt%2FO1TXLIqsDC7pdOzMl259hqrdwkDLjxrf8Fsg2ZwYVIIkoHkm%2Freplicate-prediction-vygd5qqab1rmc0ctb9cbr14cxw.jpg%22%5D%2C%22prompt%22%3A%22describe%20this%20image%20in%20detail%22%2C%22videos%22%3A%5B%5D%2C%22temperature%22%3A1%2C%22dynamic_thinking%22%3Afalse%2C%22max_output_tokens%22%3A65535%7D) [Share](https://replicate.com/signin?next=https://replicate.com/google/gemini-2.5-flash) [Report](https://replicate.com/p/94p6hekpwnrme0ctc1kb2c6j18/report) [View full prediction](https://replicate.com/p/94p6hekpwnrme0ctc1kb2c6j18)

Show logs

`Generating text with gemini-2.5-flash...
Processing 1 images...
Text generation completed in 10.57s
Input token count: 263
Output token count: 515`

Copy logsFullscreen logsDownload logs

#### Pricing

$0.30

per million input tokens

or around 3,333,333 tokens for $1

$2.50

per million output tokens

or 400,000 tokens for $1

[Check out our docs](https://replicate.com/docs/billing) for more information about how pricing works on Replicate. Looking for volume pricing? [Get in touch](mailto:sales@replicate.com).

## Readme

# Gemini 2.5 Flash

Gemini 2.5 Flash is Google DeepMind’s cost-efficient, high-speed multimodal model designed for production workloads.

It balances speed, reasoning, and controllable “thinking depth,” making it ideal for developers who need performance at scale.

* * *

## Key Features

- **Multimodal Input**: Supports text, images, audio, and video as inputs.
- **Long Context Handling**: Works with extremely long inputs (up to ~1 million tokens).
- **Controllable Reasoning**: Developers can choose how much internal reasoning (“thinking”) the model applies.
- **Optimized for Speed & Cost**: Fast inference times with efficient compute usage.
- **Flexible Output**: Generates text, captions, summaries, structured data, and more.

Model created
5 months, 3 weeks ago


Model updated
1 month, 2 weeks ago


## Related models

[![gpt-4o-mini](https://tjzk.replicate.delivery/models_models_cover_image/274e635d-c3e7-4d26-919a-43d5f1431b00/Screenshot_2025-05-14_at_8.21.53P.png)\\
\\
**openai/gpt-4o-mini** \\
\\
Generate and chat in natural language from text prompts, with optional image inputs for visual understanding and image-to-text tasks. Handle question-answering, code generation and explanation, text translation, document summarization, data analysis, and information extraction. Accept single prompts or multi-turn chat messages with a system prompt, and support temperature, top\_p, and repetition penalties for control. Return long-form text outputs (up to roughly 4k tokens) with low latency and low cost.\\
\\
3.6m runs\\
\\
Official](https://replicate.com/openai/gpt-4o-mini "openai/gpt-4o-mini: Generate and chat in natural language from text prompts, with optional image inputs for visual understanding and image-to-text tasks. Handle question-answering, code generation and explanation, text translation, document summarization, data analysis, and information extraction. Accept single prompts or multi-turn chat messages with a system prompt, and support temperature, top_p, and repetition penalties for control. Return long-form text outputs (up to roughly 4k tokens) with low latency and low cost.") [![gpt-4.1-nano](https://tjzk.replicate.delivery/models_models_featured_image/f2c12cca-5859-407a-9189-0509526e4757/Screenshot_2025-05-01_at_12.29.png)\\
\\
**openai/gpt-4.1-nano** \\
\\
Generate and classify text from prompts or chat messages with ultra-low latency and up to a 1M-token context window. Accept optional images to perform captioning and basic visual understanding, returning text outputs. Use for autocomplete, structured text generation, fast question answering, text classification, simple reasoning, summarization, translation, data extraction, and lightweight code generation/code understanding in speed- and budget-sensitive, high-throughput applications.\\
\\
1.0m runs\\
\\
Official](https://replicate.com/openai/gpt-4.1-nano "openai/gpt-4.1-nano: Generate and classify text from prompts or chat messages with ultra-low latency and up to a 1M-token context window. Accept optional images to perform captioning and basic visual understanding, returning text outputs. Use for autocomplete, structured text generation, fast question answering, text classification, simple reasoning, summarization, translation, data extraction, and lightweight code generation/code understanding in speed- and budget-sensitive, high-throughput applications.") [![gpt-4o](https://tjzk.replicate.delivery/models_models_cover_image/c0841fcc-b236-4634-8f13-65627b2d5af6/Screenshot_2025-05-18_at_1.14.36.webp)\\
\\
**openai/gpt-4o** \\
\\
Chat with a multimodal large language model using text and optional images as input and receive streamed text outputs. Generate and edit text, write and debug code, perform reasoning and math, answer questions, translate, summarize documents, and extract structured information. Analyze images for captioning, OCR, chart/table interpretation, and multimodal document Q&A, combining text and vision in a single call. Streams tokens for low-latency interaction.\\
\\
363.3k runs\\
\\
Official](https://replicate.com/openai/gpt-4o "openai/gpt-4o: Chat with a multimodal large language model using text and optional images as input and receive streamed text outputs. Generate and edit text, write and debug code, perform reasoning and math, answer questions, translate, summarize documents, and extract structured information. Analyze images for captioning, OCR, chart/table interpretation, and multimodal document Q&A, combining text and vision in a single call. Streams tokens for low-latency interaction.") [![gemini-3-pro](https://tjzk.replicate.delivery/models_models_featured_image/491d3732-fa76-4f92-aa17-d073f38c1a77/Gemini-3.png)\\
\\
**google/gemini-3-pro** \\
\\
Generate and reason over text from prompts, with optional image, audio, and video inputs. Produce answers, explanations, and structured outputs for multimodal queries, including image captioning, visual Q&A, video and audio understanding. Support core LLM tasks such as code generation and code review, text translation, question answering, data analysis, document and video summarization, and long-context reasoning. Enable deeper step-by-step reasoning by setting the thinking\_level to high. Output is text.\\
\\
5.5k runs\\
\\
Official](https://replicate.com/google/gemini-3-pro "google/gemini-3-pro: Generate and reason over text from prompts, with optional image, audio, and video inputs. Produce answers, explanations, and structured outputs for multimodal queries, including image captioning, visual Q&A, video and audio understanding. Support core LLM tasks such as code generation and code review, text translation, question answering, data analysis, document and video summarization, and long-context reasoning. Enable deeper step-by-step reasoning by setting the thinking_level to high. Output is text.") [![gemini-3-flash](https://tjzk.replicate.delivery/models_models_featured_image/489d0931-1c41-40b2-a44b-0991de35443b/gemini-3-flash-model-2096x118.webp)\\
\\
**google/gemini-3-flash** \\
\\
Generate and analyze text from prompts, images, audio, and video with fast, low-latency responses. Accept text plus up to 10 images, up to 10 videos (up to 45 minutes each), or one long audio clip (up to 8.4 hours), and return text outputs for reasoning, captioning, summarization, and analysis. Perform text-generation, question-answering, code-generation and code-understanding, text-translation, document-summarization, data-analysis, and structured output formatting. Handle image captioning, visual question answering, UI interpretation, video analysis and summarization, and audio understanding. Support adjustable reasoning depth via thinking\_level (low/high) and long outputs (up to ~65k tokens), enabling interactive agents, real-time assistants, and production-scale workflows.\\
\\
4 runs\\
\\
Official](https://replicate.com/google/gemini-3-flash "google/gemini-3-flash: Generate and analyze text from prompts, images, audio, and video with fast, low-latency responses. Accept text plus up to 10 images, up to 10 videos (up to 45 minutes each), or one long audio clip (up to 8.4 hours), and return text outputs for reasoning, captioning, summarization, and analysis. Perform text-generation, question-answering, code-generation and code-understanding, text-translation, document-summarization, data-analysis, and structured output formatting. Handle image captioning, visual question answering, UI interpretation, video analysis and summarization, and audio understanding. Support adjustable reasoning depth via thinking_level (low/high) and long outputs (up to ~65k tokens), enabling interactive agents, real-time assistants, and production-scale workflows.") [![claude-4.5-haiku](https://tjzk.replicate.delivery/models_models_featured_image/05737276-9667-4b1c-b5b8-111a0351ddf8/claudehaiku45.png)\\
\\
**anthropic/claude-4.5-haiku** \\
\\
Generate text for chat, Q&A, coding, and document workflows with fast, low-latency responses. Accept text prompts and optional images and return text, supporting image captioning and visual analysis for diagrams, screenshots, and photos. Handle long-context tasks with a 200K-token window for multi-document summarization, extraction, and retrieval-augmented reasoning. Write and debug code across languages; translate and summarize text; extract structured data; brainstorm and research. Serve real-time and high-volume applications such as customer support, content moderation, tutoring, and rapid prototyping with strong cost efficiency.\\
\\
4.0k runs\\
\\
Official](https://replicate.com/anthropic/claude-4.5-haiku "anthropic/claude-4.5-haiku: Generate text for chat, Q&A, coding, and document workflows with fast, low-latency responses. Accept text prompts and optional images and return text, supporting image captioning and visual analysis for diagrams, screenshots, and photos. Handle long-context tasks with a 200K-token window for multi-document summarization, extraction, and retrieval-augmented reasoning. Write and debug code across languages; translate and summarize text; extract structured data; brainstorm and research. Serve real-time and high-volume applications such as customer support, content moderation, tutoring, and rapid prototyping with strong cost efficiency.") [![claude-4-sonnet](https://tjzk.replicate.delivery/models_models_featured_image/a4e07111-b44f-43b1-a346-5be824f64913/9890d1bb39c15c41772af22d2282e.webp)\\
\\
**anthropic/claude-4-sonnet** \\
\\
Generate and reason over text and code from a prompt, with optional image input for captioning and visual analysis, and output as streamed text. Switch between fast standard responses and an extended thinking mode for complex reasoning with budgets up to 64K tokens. Tackle code generation and debugging, multi-file code understanding, question answering, data analysis, document summarization, and text translation. Accept a steerable system prompt, configurable max tokens, and image downscaling for cost control. Notable performance includes 72.7% SWE-bench Verified for coding and strong reasoning gains on GPQA, MMMLU, MMMU, and AIME with extended thinking.\\
\\
993.0k runs\\
\\
Official](https://replicate.com/anthropic/claude-4-sonnet "anthropic/claude-4-sonnet: Generate and reason over text and code from a prompt, with optional image input for captioning and visual analysis, and output as streamed text. Switch between fast standard responses and an extended thinking mode for complex reasoning with budgets up to 64K tokens. Tackle code generation and debugging, multi-file code understanding, question answering, data analysis, document summarization, and text translation. Accept a steerable system prompt, configurable max tokens, and image downscaling for cost control. Notable performance includes 72.7% SWE-bench Verified for coding and strong reasoning gains on GPQA, MMMLU, MMMU, and AIME with extended thinking.") [![meta-llama-3-70b-instruct](https://tjzk.replicate.delivery/models_models_featured_image/3dcb020b-1fad-4101-84cf-88af9b20ac21/meta-logo.png)\\
\\
**meta/meta-llama-3-70b-instruct** \\
\\
Generate assistant-style text and code from a text prompt. Handle chat completions, question answering, code generation and explanation, text translation, document summarization, data analysis and reasoning, and content drafting. Supports 8k-token context windows for longer conversations and documents. Uses a 70B-parameter Llama 3 Instruct model tuned for dialogue and safety.\\
\\
162.6m runs\\
\\
Official](https://replicate.com/meta/meta-llama-3-70b-instruct "meta/meta-llama-3-70b-instruct: Generate assistant-style text and code from a text prompt. Handle chat completions, question answering, code generation and explanation, text translation, document summarization, data analysis and reasoning, and content drafting. Supports 8k-token context windows for longer conversations and documents. Uses a 70B-parameter Llama 3 Instruct model tuned for dialogue and safety.")

Copy model identifier (for use with [replicate.run](https://replicate.com/docs/topics/models/run-a-model#run-a-model-with-the-api))

**This model is booted and ready for API calls.**

Official models are always on, maintained, and have predictable pricing.

This model is priced per input token and output token. [View more.](https://replicate.com/google/gemini-2.5-flash#pricing)

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

# Logs (94p6hekpwnrme0ctc1kb2c6j18)

Succeeded

`Generating text with gemini-2.5-flash...
Processing 1 images...
Text generation completed in 10.57s
Input token count: 263
Output token count: 515`