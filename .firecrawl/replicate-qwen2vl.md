[Replicate has joined Cloudflare](https://replicate.com/blog/replicate-cloudflare)

[Playground](https://replicate.com/lucataco/qwen2-vl-7b-instruct) [API](https://replicate.com/lucataco/qwen2-vl-7b-instruct/api) [Examples](https://replicate.com/lucataco/qwen2-vl-7b-instruct/examples) [README](https://replicate.com/lucataco/qwen2-vl-7b-instruct/readme) [Versions](https://replicate.com/lucataco/qwen2-vl-7b-instruct/versions)

## Input

FormJSONNode.jsPythonHTTPCogDocker

media
\*file

Upload a file from your machine

Input image or video file

prompt
string

`Shift` \+ `Return` to add a new line

Describe this video in detail.

Custom prompt to guide the description

Default: "Describe this in detail."

max\_new\_tokens
integer

(minimum: 1, maximum: 512)

max\_new\_tokens

Maximum number of tokens to generate

Default: 128

Run this model in Node.js with [one line of code](https://replicate.com/docs/get-started/nodejs#quickstart-scaffold-a-project-with-a-one-liner):

npx create-replicate --model=lucataco/qwen2-vl-7b-instruct

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

Run lucataco/qwen2-vl-7b-instruct using Replicate’s API. Check out the [model's schema](https://replicate.com/lucataco/qwen2-vl-7b-instruct/api/schema) for an overview of inputs and outputs.

```javascript
const output = await replicate.run(
  "lucataco/qwen2-vl-7b-instruct:bf57361c75677fc33d480d0c5f02926e621b2caa2000347cb74aeae9d2ca07ee",
  {
    input: {
      media: "https://replicate.delivery/pbxt/MB8qw19bkjGGCTr8Px17db2ydBA3xrHyxBk5g5wRSEH0in9N/q2m-LO3Xg0vO0xmw.mp4",
      prompt: "Describe this video in detail.",
      max_new_tokens: 128
    }
  }
);

console.log(output);
```

Copy

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

Run lucataco/qwen2-vl-7b-instruct using Replicate’s API. Check out the [model's schema](https://replicate.com/lucataco/qwen2-vl-7b-instruct/api/schema) for an overview of inputs and outputs.

```python
output = replicate.run(
    "lucataco/qwen2-vl-7b-instruct:bf57361c75677fc33d480d0c5f02926e621b2caa2000347cb74aeae9d2ca07ee",
    input={
        "media": "https://replicate.delivery/pbxt/MB8qw19bkjGGCTr8Px17db2ydBA3xrHyxBk5g5wRSEH0in9N/q2m-LO3Xg0vO0xmw.mp4",
        "prompt": "Describe this video in detail.",
        "max_new_tokens": 128
    }
)

print(output)
```

Copy

To learn more, take a look at [the guide on getting started with Python](https://replicate.com/docs/get-started/python).

Set the `REPLICATE_API_TOKEN` environment variable:

```shell
export REPLICATE_API_TOKEN=<paste-your-token-here>
```

VisibilityCopy

Find your API token in [your account settings](https://replicate.com/account/api-tokens).

Run lucataco/qwen2-vl-7b-instruct using Replicate’s API. Check out the [model's schema](https://replicate.com/lucataco/qwen2-vl-7b-instruct/api/schema) for an overview of inputs and outputs.

```shell
curl -s -X POST \
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: wait" \
  -d $'{
    "version": "lucataco/qwen2-vl-7b-instruct:bf57361c75677fc33d480d0c5f02926e621b2caa2000347cb74aeae9d2ca07ee",
    "input": {
      "media": "https://replicate.delivery/pbxt/MB8qw19bkjGGCTr8Px17db2ydBA3xrHyxBk5g5wRSEH0in9N/q2m-LO3Xg0vO0xmw.mp4",
      "prompt": "Describe this video in detail.",
      "max_new_tokens": 128
    }
  }' \
  https://api.replicate.com/v1/predictions
```

Copy

To learn more, take a look at [Replicate’s HTTP API reference docs](https://replicate.com/docs/reference/http).

You can run this model locally using [Cog](https://github.com/replicate/cog). First, install Cog:

```shell
brew install cog
```

Copy

If you don’t have [Homebrew](https://brew.sh/), there are [other installation options available](https://github.com/replicate/cog#install).

Run this to download the model and run it in your local environment:

```shell
cog predict r8.im/lucataco/qwen2-vl-7b-instruct@sha256:bf57361c75677fc33d480d0c5f02926e621b2caa2000347cb74aeae9d2ca07ee \
  -i 'media="https://replicate.delivery/pbxt/MB8qw19bkjGGCTr8Px17db2ydBA3xrHyxBk5g5wRSEH0in9N/q2m-LO3Xg0vO0xmw.mp4"' \
  -i 'prompt="Describe this video in detail."' \
  -i 'max_new_tokens=128'
```

Copy

To learn more, take a look at [the Cog documentation](https://github.com/replicate/cog).

Run this to download the model and run it in your local environment:

```shell
docker run -d -p 5000:5000 --gpus=all r8.im/lucataco/qwen2-vl-7b-instruct@sha256:bf57361c75677fc33d480d0c5f02926e621b2caa2000347cb74aeae9d2ca07ee
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d $'{
    "input": {
      "media": "https://replicate.delivery/pbxt/MB8qw19bkjGGCTr8Px17db2ydBA3xrHyxBk5g5wRSEH0in9N/q2m-LO3Xg0vO0xmw.mp4",
      "prompt": "Describe this video in detail.",
      "max_new_tokens": 128
    }
  }' \
  http://localhost:5000/predictions
```

Copy

To learn more, take a look at [the Cog documentation](https://github.com/replicate/cog).

Sign in to run this model

[Sign in with GitHub](https://replicate.com/login/github/?next=/lucataco/qwen2-vl-7b-instruct)

By signing in, you agree to our

[terms of service](https://replicate.com/terms) and [privacy policy](https://replicate.com/privacy)

## Output

PreviewJSON

The video features a monkey riding a skateboard in a park. The monkey is wearing roller skates and is seen moving forward on the skateboard, with its arms outstretched for balance. The park is filled with people sitting on benches and walking around, enjoying the sunny day. The monkey appears to be enjoying itself, and the scene is filled with a sense of fun and playfulness. The park is surrounded by trees and greenery, creating a peaceful and relaxing atmosphere. Overall, the video captures a unique and entertaining moment of a monkey enjoying a day out in the park on roller skates.

```
{
  "completed_at": "2024-12-20T19:47:48.564703Z",
  "created_at": "2024-12-20T19:47:42.319000Z",
  "data_removed": false,
  "error": null,
  "id": "qwshq0ccdxrm80ckwpe9s1r298",
  "input": {
    "media": "https://replicate.delivery/pbxt/MB8qw19bkjGGCTr8Px17db2ydBA3xrHyxBk5g5wRSEH0in9N/q2m-LO3Xg0vO0xmw.mp4",
    "prompt": "Describe this video in detail.",
    "max_new_tokens": 128
  },
  "logs": null,
  "metrics": {
    "predict_time": 6.238541933,
    "total_time": 6.245703
  },
  "output": "The video features a monkey riding a skateboard in a park. The monkey is wearing roller skates and is seen moving forward on the skateboard, with its arms outstretched for balance. The park is filled with people sitting on benches and walking around, enjoying the sunny day. The monkey appears to be enjoying itself, and the scene is filled with a sense of fun and playfulness. The park is surrounded by trees and greenery, creating a peaceful and relaxing atmosphere. Overall, the video captures a unique and entertaining moment of a monkey enjoying a day out in the park on roller skates.",
  "started_at": "2024-12-20T19:47:42.326161Z",
  "status": "succeeded",
  "urls": {
    "get": "https://api.replicate.com/v1/predictions/qwshq0ccdxrm80ckwpe9s1r298",
    "cancel": "https://api.replicate.com/v1/predictions/qwshq0ccdxrm80ckwpe9s1r298/cancel"
  },
  "version": "bf57361c75677fc33d480d0c5f02926e621b2caa2000347cb74aeae9d2ca07ee"
}
```

Copy

Generated in

6.2 seconds

[Tweak it](https://replicate.com/lucataco/qwen2-vl-7b-instruct/versions/bf57361c75677fc33d480d0c5f02926e621b2caa2000347cb74aeae9d2ca07ee?prediction=qwshq0ccdxrm80ckwpe9s1r298) [Iterate in playground](https://replicate.com/playground?model=lucataco/qwen2-vl-7b-instruct&inputs=%7B%22media%22%3A%22https%3A%2F%2Freplicate.delivery%2Fpbxt%2FMB8qw19bkjGGCTr8Px17db2ydBA3xrHyxBk5g5wRSEH0in9N%2Fq2m-LO3Xg0vO0xmw.mp4%22%2C%22prompt%22%3A%22Describe%20this%20video%20in%20detail.%22%2C%22max_new_tokens%22%3A128%7D) [Share](https://replicate.com/signin?next=https://replicate.com/lucataco/qwen2-vl-7b-instruct) [Report](https://replicate.com/p/qwshq0ccdxrm80ckwpe9s1r298/report) [View full prediction](https://replicate.com/p/qwshq0ccdxrm80ckwpe9s1r298)

Show logs

``

Copy logsFullscreen logsDownload logs

## Run time and cost

This model costs approximately $0.0044 to run on Replicate, or 227 runs per $1, but this varies depending on your inputs. It is also open source and you can [run it on your own computer with Docker](https://replicate.com/lucataco/qwen2-vl-7b-instruct/api).



This model runs on [Nvidia L40S GPU hardware](https://replicate.com/docs/billing).




Predictions typically complete within 5 seconds.





## Readme

# Qwen2-VL-7B-Instruct

Alibaba Cloud’s Qwen team built this seven billion parameter vision language model that can understand both images and videos. It’s the latest version of their Qwen-VL model and represents about a year of improvements.

## What it does

This model lets you ask questions about images and videos using text. Think of it as having a conversation about visual content.

### Images at any resolution

Unlike older models that need images in specific sizes, this one handles whatever resolution you throw at it. Whether you’re analyzing a tiny icon or a massive document scan, the model adapts to the native resolution. Higher resolutions give better results but take more time to process.

### Long video understanding

You can feed it videos over 20 minutes long. The model can answer questions about what’s happening, create summaries, or have a conversation about the content. This makes it useful for analyzing everything from tutorial videos to recorded meetings.

### Multilingual text recognition

Besides English and Chinese, the model can read text within images in most European languages, Japanese, Korean, Arabic, Vietnamese, and more. So if you have a photo of a street sign in Paris or a menu in Tokyo, it can understand the text.

### State-of-the-art performance

On visual understanding benchmarks like MathVista, DocVQA, RealWorldQA, and MTVQA, this model achieves some of the best scores available. It’s particularly strong at understanding documents and mathematical content.

## Example uses

**Document analysis:** Extract information from invoices, forms, receipts, or any other document. The model handles complex layouts and can read text at different orientations.

**Video content:** Summarize long videos, answer questions about specific moments, or create descriptions of what’s happening.

**Multilingual content:** Analyze images with text in multiple languages, useful for translating signs, menus, or documents.

**Chart and diagram understanding:** Explain graphs, flowcharts, technical diagrams, or data visualizations.

## Technical details

The model uses what they call “Naive Dynamic Resolution” which maps images into a flexible number of visual tokens based on the actual resolution. It also uses Multimodal Rotary Position Embedding (M-ROPE) to handle the position information for text (1D), images (2D), and videos (3D).

The Qwen team released three model sizes: two billion, seven billion, and seventy-two billion parameters. This is the seven billion parameter instruction-tuned version, which offers a good balance between performance and speed.

## Things to know

Let’s be honest about the limitations:

**No audio support:** The model doesn’t process audio from videos, only the visual content.

**Knowledge cutoff:** The training images go up to June 2023, so it won’t recognize events, products, or people from after that date.

**Counting accuracy:** In complex scenes with lots of objects, the counting isn’t always perfect. If you need precise counts, double-check the results.

**Complex instructions:** When you give it intricate multi-step instructions, the model sometimes struggles. Breaking complex tasks into simpler steps usually works better.

**People and brands:** The model has limited ability to recognize specific individuals or intellectual property. It might not identify every celebrity or branded product.

## Try it yourself

You can try the Qwen2-VL-7B-Instruct model on the [Replicate Playground](https://replicate.com/playground).

Model created
over 1 year ago


Copy model identifier (for use with [replicate.run](https://replicate.com/docs/topics/models/run-a-model#run-a-model-with-the-api))

**This model is not yet booted but ready for API calls.** Your first API call will boot the model and may take longer, but after that subsequent responses will be fast.

This model costs approximately $0.0044 to run on Replicate, but this varies depending on your inputs.

Choose a file from your machine

Hint: you can also drag files onto the input

Copy

Show

Copy

Copy

Copy

Copy

Show

Copy

Copy

Copy

Show

Copy

Copy

Copy

# Logs (qwshq0ccdxrm80ckwpe9s1r298)

Succeeded

``

Copy

Copy

Copy