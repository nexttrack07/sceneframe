[Replicate has joined Cloudflare](https://replicate.com/blog/replicate-cloudflare)

[Playground](https://replicate.com/lucataco/moondream2) [API](https://replicate.com/lucataco/moondream2/api) [Examples](https://replicate.com/lucataco/moondream2/examples) [README](https://replicate.com/lucataco/moondream2/readme) [Versions](https://replicate.com/lucataco/moondream2/versions)

## Input

FormJSONNode.jsPythonHTTP

![image](https://replicate.delivery/pbxt/KZKNhDQHqycw8Op7w056J8YTX5Bnb7xVcLiyB4le7oUgT2cY/moondream2.png)

image
\*file

Upload a file from your machineTake a photo with your webcam

Input image

prompt
string

`Shift` \+ `Return` to add a new line

Describe this image

Input prompt

Default: "Describe this image"

Run this model in Node.js with [one line of code](https://replicate.com/docs/get-started/nodejs#quickstart-scaffold-a-project-with-a-one-liner):

npx create-replicate --model=lucataco/moondream2

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

Run lucataco/moondream2 using Replicate’s API. Check out the [model's schema](https://replicate.com/lucataco/moondream2/api/schema) for an overview of inputs and outputs.

```javascript
const output = await replicate.run(
  "lucataco/moondream2:72ccb656353c348c1385df54b237eeb7bfa874bf11486cf0b9473e691b662d31",
  {
    input: {
      image: "https://replicate.delivery/pbxt/KZKNhDQHqycw8Op7w056J8YTX5Bnb7xVcLiyB4le7oUgT2cY/moondream2.png",
      prompt: "Describe this image"
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

Run lucataco/moondream2 using Replicate’s API. Check out the [model's schema](https://replicate.com/lucataco/moondream2/api/schema) for an overview of inputs and outputs.

```python
output = replicate.run(
    "lucataco/moondream2:72ccb656353c348c1385df54b237eeb7bfa874bf11486cf0b9473e691b662d31",
    input={
        "image": "https://replicate.delivery/pbxt/KZKNhDQHqycw8Op7w056J8YTX5Bnb7xVcLiyB4le7oUgT2cY/moondream2.png",
        "prompt": "Describe this image"
    }
)

# The lucataco/moondream2 model can stream output as it's running.
# The predict method returns an iterator, and you can iterate over that output.
for item in output:
    # https://replicate.com/lucataco/moondream2/api#output-schema
    print(item, end="")
```

StreamingCopy

To learn more, take a look at [the guide on getting started with Python](https://replicate.com/docs/get-started/python).

Set the `REPLICATE_API_TOKEN` environment variable:

```shell
export REPLICATE_API_TOKEN=<paste-your-token-here>
```

VisibilityCopy

Find your API token in [your account settings](https://replicate.com/account/api-tokens).

Run lucataco/moondream2 using Replicate’s API. Check out the [model's schema](https://replicate.com/lucataco/moondream2/api/schema) for an overview of inputs and outputs.

```shell
curl -s -X POST \
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: wait" \
  -d $'{
    "version": "lucataco/moondream2:72ccb656353c348c1385df54b237eeb7bfa874bf11486cf0b9473e691b662d31",
    "input": {
      "image": "https://replicate.delivery/pbxt/KZKNhDQHqycw8Op7w056J8YTX5Bnb7xVcLiyB4le7oUgT2cY/moondream2.png",
      "prompt": "Describe this image"
    }
  }' \
  https://api.replicate.com/v1/predictions
```

Copy

To learn more, take a look at [Replicate’s HTTP API reference docs](https://replicate.com/docs/reference/http).

Sign in to run this model

[Each run costs approximately $0.0028.](https://replicate.com/lucataco/moondream2#pricing "See run time & cost for details")Alternatively, try out [these models](https://replicate.com/collections/try-for-free) for free.

[Sign in with GitHub](https://replicate.com/login/github/?next=/lucataco/moondream2)

By signing in, you agree to our

[terms of service](https://replicate.com/terms) and [privacy policy](https://replicate.com/privacy)

## Output

PreviewJSON

The image features a logo with a smiling blue circle above the word "moondream" written in black text.

```
{
  "completed_at": "2024-12-06T21:20:04.402628Z",
  "created_at": "2024-12-06T21:19:51.071000Z",
  "data_removed": false,
  "error": null,
  "id": "cn11yqq13xrme0ckkqbs8ct5n8",
  "input": {
    "image": "https://replicate.delivery/pbxt/KZKNhDQHqycw8Op7w056J8YTX5Bnb7xVcLiyB4le7oUgT2cY/moondream2.png",
    "prompt": "Describe this image"
  },
  "logs": "The attention mask is not set and cannot be inferred from input because pad token is same as eos token.As a consequence, you may observe unexpected behavior. Please pass your input's `attention_mask` to obtain reliable results.\nThe `seen_tokens` attribute is deprecated and will be removed in v4.41. Use the `cache_position` model input instead.",
  "metrics": {
    "predict_time": 0.566297241,
    "total_time": 13.331628
  },
  "output": [\
    "",\
    " ",\
    "The ",\
    "image ",\
    "features ",\
    "a ",\
    "logo ",\
    "with ",\
    "a ",\
    "smiling ",\
    "blue ",\
    "circle ",\
    "above ",\
    "the ",\
    "word ",\
    "",\
    "",\
    "",\
    "",\
    "\"moondream\" ",\
    "written ",\
    "in ",\
    "black ",\
    "",\
    "",\
    "text."\
  ],
  "started_at": "2024-12-06T21:20:03.836331Z",
  "status": "succeeded",
  "urls": {
    "stream": "https://stream-b.svc.ric1.c.replicate.net/v1/streams/efp7elvtevbmebfkshm4zxgcpbccnhtq5rshcn5twpyqzk4f7eoq",
    "get": "https://api.replicate.com/v1/predictions/cn11yqq13xrme0ckkqbs8ct5n8",
    "cancel": "https://api.replicate.com/v1/predictions/cn11yqq13xrme0ckkqbs8ct5n8/cancel"
  },
  "version": "72ccb656353c348c1385df54b237eeb7bfa874bf11486cf0b9473e691b662d31"
}
```

Copy

Generated in

0.6 seconds

[Tweak it](https://replicate.com/lucataco/moondream2/versions/72ccb656353c348c1385df54b237eeb7bfa874bf11486cf0b9473e691b662d31?prediction=cn11yqq13xrme0ckkqbs8ct5n8) [Iterate in playground](https://replicate.com/playground?model=lucataco/moondream2&inputs=%7B%22image%22%3A%22https%3A%2F%2Freplicate.delivery%2Fpbxt%2FKZKNhDQHqycw8Op7w056J8YTX5Bnb7xVcLiyB4le7oUgT2cY%2Fmoondream2.png%22%2C%22prompt%22%3A%22Describe%20this%20image%22%7D) [Share](https://replicate.com/signin?next=https://replicate.com/lucataco/moondream2) [Report](https://replicate.com/p/cn11yqq13xrme0ckkqbs8ct5n8/report) [View full prediction](https://replicate.com/p/cn11yqq13xrme0ckkqbs8ct5n8)

Show logs

``The attention mask is not set and cannot be inferred from input because pad token is same as eos token.As a consequence, you may observe unexpected behavior. Please pass your input's `attention_mask` to obtain reliable results.
The `seen_tokens` attribute is deprecated and will be removed in v4.41. Use the `cache_position` model input instead.``

Copy logsFullscreen logsDownload logs

## Run time and cost

This model costs approximately $0.0028 to run on Replicate, or 357 runs per $1, but this varies depending on your inputs. It is also open source and you can [run it on your own computer with Docker](https://replicate.com/lucataco/moondream2/api).



This model runs on [Nvidia L40S GPU hardware](https://replicate.com/docs/billing).




Predictions typically complete within 3 seconds.





## Readme

## Moondream2

moondream2 is a small vision language model designed to run efficiently on edge devices. Check out the [GitHub repository](https://github.com/vikhyat/moondream) for details, or try it out on the [Hugging Face Space](https://huggingface.co/spaces/vikhyatk/moondream2)!

**Benchmarks**

| Release | VQAv2 | GQA | TextVQA | DocVQA | TallyQA<br>(simple/full) | POPE<br>(rand/pop/adv) |
| --- | --- | --- | --- | --- | --- | --- |
| **2024-07-23** (latest) | 79.4 | 64.9 | 60.2 | 61.9 | 82.0 / 76.8 | 91.3 / 89.7 / 86.9 |
| 2024-05-20 | 79.4 | 63.1 | 57.2 | 30.5 | 82.1 / 76.6 | 91.5 / 89.6 / 86.2 |
| 2024-05-08 | 79.0 | 62.7 | 53.1 | 30.5 | 81.6 / 76.1 | 90.6 / 88.3 / 85.0 |
| 2024-04-02 | 77.7 | 61.7 | 49.7 | 24.3 | 80.1 / 74.2 | - |
| 2024-03-13 | 76.8 | 60.6 | 46.4 | 22.2 | 79.6 / 73.3 | - |
| 2024-03-06 | 75.4 | 59.8 | 43.1 | 20.9 | 79.5 / 73.2 | - |
| 2024-03-04 | 74.2 | 58.5 | 36.4 | - | - | - |

**Usage**

The model is updated regularly, so we recommend pinning the model version to a
specific release as shown above.

Model created
over 1 year ago


Copy model identifier (for use with [replicate.run](https://replicate.com/docs/topics/models/run-a-model#run-a-model-with-the-api))

**This model is booted and ready for API calls.**

This model costs approximately $0.0028 to run on Replicate, but this varies depending on your inputs.

Choose a file from your machine

Hint: you can also drag files onto the input

Take a picture with your webcam

Copy

Show

Copy

Copy

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

# Logs (cn11yqq13xrme0ckkqbs8ct5n8)

Succeeded

``The attention mask is not set and cannot be inferred from input because pad token is same as eos token.As a consequence, you may observe unexpected behavior. Please pass your input's `attention_mask` to obtain reliable results.
The `seen_tokens` attribute is deprecated and will be removed in v4.41. Use the `cache_position` model input instead.``