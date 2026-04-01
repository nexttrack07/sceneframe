[Replicate has joined Cloudflare](https://replicate.com/blog/replicate-cloudflare)

# Pricing

You only pay for what you use on Replicate. Some models are billed by hardware and time, others by input and output.

#### [Public models](https://replicate.com/pricing\#public-models)

Thousands of open-source machine learning models have been contributed by our community and more are added every day. We also host a wide variety of proprietary models.

Most models are billed by the time they take to run. The [price-per-second](https://replicate.com/pricing#hardware) varies according to the hardware in use. When running or training one of these public models, you only pay for the time it takes to process your request.

Some models are billed by input and output.We've included some examples below.

You'll find estimates for how much any model will cost you on the model's page.

[![anthropic/claude-3.7-sonnet](https://tjzk.replicate.delivery/models_models_featured_image/56aed331-fb30-4e82-9708-b63b2fa90699/claude-3.7-logo.webp)\\
\\
**anthropic/claude-3.7-sonnet** \\
\\
The most intelligent Claude model and the first hybrid reasoning model on the market (claude-3-7-sonnet-20250219)\\
\\
$0.015/ thousand output tokens\\
\\
$3.00/ million input tokens](https://replicate.com/anthropic/claude-3.7-sonnet) [![black-forest-labs/flux-1.1-pro](https://tjzk.replicate.delivery/models_models_featured_image/bd872eff-363a-4e10-8cc1-84057afa9f57/flux-1.1-cover.webp)\\
\\
**black-forest-labs/flux-1.1-pro** \\
\\
Faster, better FLUX Pro. Text-to-image model with excellent image quality, prompt adherence, and output diversity.\\
\\
$0.04/ output image](https://replicate.com/black-forest-labs/flux-1.1-pro) [![black-forest-labs/flux-dev](https://tjzk.replicate.delivery/models_models_featured_image/cb4203e5-9ece-42e7-b326-98ff3fa35c3a/Replicate_Prediction_15.webp)\\
\\
**black-forest-labs/flux-dev** \\
\\
A 12 billion parameter rectified flow transformer capable of generating images from text descriptions\\
\\
$0.025/ output image](https://replicate.com/black-forest-labs/flux-dev) [![black-forest-labs/flux-schnell](https://tjzk.replicate.delivery/models_models_featured_image/67c990ba-bb67-4355-822f-2bd8c42b2f0d/flux-schnell.webp)\\
\\
**black-forest-labs/flux-schnell** \\
\\
The fastest image generation model tailored for local development and personal use\\
\\
$3.00/ thousand output images](https://replicate.com/black-forest-labs/flux-schnell) [![deepseek-ai/deepseek-r1](https://tjzk.replicate.delivery/models_models_featured_image/302182ab-af74-4963-97f2-6121a80c61d7/deepseek-r1-cover.webp)\\
\\
**deepseek-ai/deepseek-r1** \\
\\
A reasoning model trained with reinforcement learning, on par with OpenAI o1\\
\\
$0.01/ thousand output tokens\\
\\
$3.75/ million input tokens](https://replicate.com/deepseek-ai/deepseek-r1) [![ideogram-ai/ideogram-v3-quality](https://tjzk.replicate.delivery/models_models_featured_image/f285d3d6-40bb-4f15-aa82-c163e33c6000/tmpx4azqibw.webp)\\
\\
**ideogram-ai/ideogram-v3-quality** \\
\\
The highest quality Ideogram v3 model. v3 creates images with stunning realism, creative designs, and consistent styles\\
\\
$0.09/ output image](https://replicate.com/ideogram-ai/ideogram-v3-quality) [![recraft-ai/recraft-v3](https://tjzk.replicate.delivery/models_models_featured_image/a2b66c42-4633-443d-997f-cc987bca07c7/V3.webp)\\
\\
**recraft-ai/recraft-v3** \\
\\
Recraft V3 (code-named red\_panda) is a text-to-image model with the ability to generate long texts, and images in a wide list of styles. As of today, it is SOTA in image generation, proven by the Text-to-Image Benchmark by Artificial Analysis\\
\\
$0.04/ output image](https://replicate.com/recraft-ai/recraft-v3) [![wavespeedai/wan-2.1-i2v-480p](https://tjzk.replicate.delivery/models_models_featured_image/75f0346d-ec4c-4078-bb40-6705578c0d21/replicate-prediction-br080xq9.webp)\\
\\
**wavespeedai/wan-2.1-i2v-480p** \\
\\
Accelerated inference for Wan 2.1 14B image to video, a comprehensive and open suite of video foundation models that pushes the boundaries of video generation.\\
\\
$0.09/ second of output video](https://replicate.com/wavespeedai/wan-2.1-i2v-480p) [![wavespeedai/wan-2.1-i2v-720p](https://tjzk.replicate.delivery/models_models_featured_image/cd768779-a7bf-41cd-ac59-6ab1531c1697/replicate-prediction-ce1zy3hv.webp)\\
\\
**wavespeedai/wan-2.1-i2v-720p** \\
\\
Accelerated inference for Wan 2.1 14B image to video with high resolution, a comprehensive and open suite of video foundation models that pushes the boundaries of video generation.\\
\\
$0.25/ second of output video](https://replicate.com/wavespeedai/wan-2.1-i2v-720p)

#### [Private models](https://replicate.com/pricing\#private-models)

You aren't limited to the public models on Replicate: you can deploy your own custom models using [Cog](https://github.com/replicate/cog), our open-source tool for packaging machine learning models.

Unlike public models, most private models (with the exception of [fast booting fine-tunes](https://replicate.com/docs/topics/billing#fast-booting-fine-tunes)) run on dedicated hardware so you don't have to share a queue with anyone else. This means you pay for all the time instances of the model are online: the time they spend setting up; the time they spend idle, waiting for requests; and the time they spend active, processing your requests. If you get a ton of traffic, we automatically scale up and down to handle the demand.

For fast booting fine-tunes you'll only be billed for the time the model is active and processing your requests, so you won't pay for idle time like with other private models. Fast booting fine-tunes are labeled as such in the model's version list.

#### [Hardware pricing](https://replicate.com/pricing\#hardware)

CPU (Small)

cpu-small

$0.000025/sec

$0.09/hr

GPU-CPU1xGPU RAM-RAM2GB

CPU

cpu

$0.000100/sec

$0.36/hr

GPU-CPU4xGPU RAM-RAM8GB

Nvidia A100 (80GB) GPU

gpu-a100-large

$0.001400/sec

$5.04/hr

GPU1xCPU10xGPU RAM80GBRAM144GB

2x Nvidia A100 (80GB) GPU

gpu-a100-large-2x

$0.002800/sec

$10.08/hr

GPU2xCPU20xGPU RAM160GBRAM288GB

Nvidia H100 GPU

gpu-h100

$0.001525/sec

$5.49/hr

GPU1xCPU13xGPU RAM80GBRAM72GB

Nvidia L40S GPU

gpu-l40s

$0.000975/sec

$3.51/hr

GPU1xCPU10xGPU RAM48GBRAM65GB

2x Nvidia L40S GPU

gpu-l40s-2x

$0.001950/sec

$7.02/hr

GPU2xCPU20xGPU RAM96GBRAM144GB

Nvidia T4 GPU

gpu-t4

$0.000225/sec

$0.81/hr

GPU1xCPU4xGPU RAM16GBRAM16GB

Additional hardware

4x Nvidia A100 (80GB) GPU

gpu-a100-large-4x

$0.005600/sec

$20.16/hr

Additional Multi-GPU A100 capacity is available with committed spend contracts.

8x Nvidia A100 (80GB) GPU

gpu-a100-large-8x

$0.011200/sec

$40.32/hr

Additional Multi-GPU A100 capacity is available with committed spend contracts.

2x Nvidia H100 GPU

gpu-h100-2x

$0.003050/sec

$10.98/hr

Additional Multi-GPU H100 capacity is available with committed spend contracts.

4x Nvidia H100 GPU

gpu-h100-4x

$0.006100/sec

$21.96/hr

Additional Multi-GPU H100 capacity is available with committed spend contracts.

8x Nvidia H100 GPU

gpu-h100-8x

$0.012200/sec

$43.92/hr

Additional Multi-GPU H100 capacity is available with committed spend contracts.

4x Nvidia L40S GPU

gpu-l40s-4x

$0.003900/sec

$14.04/hr

Additional Multi-GPU L40S capacity is available with committed spend contracts.

8x Nvidia L40S GPU

gpu-l40s-8x

$0.007800/sec

$28.08/hr

Additional Multi-GPU L40S capacity is available with committed spend contracts.

| Hardware | Price | GPU | CPU | GPU RAM | RAM |
| --- | --- | --- | --- | --- | --- |
| CPU (Small)<br>cpu-small | $0.000025/sec<br>$0.09/hr | - | 1x | - | 2GB |
| CPU<br>cpu | $0.000100/sec<br>$0.36/hr | - | 4x | - | 8GB |
| Nvidia A100 (80GB) GPU<br>gpu-a100-large | $0.001400/sec<br>$5.04/hr | 1x | 10x | 80GB | 144GB |
| 2x Nvidia A100 (80GB) GPU<br>gpu-a100-large-2x | $0.002800/sec<br>$10.08/hr | 2x | 20x | 160GB | 288GB |
| Nvidia H100 GPU<br>gpu-h100 | $0.001525/sec<br>$5.49/hr | 1x | 13x | 80GB | 72GB |
| Nvidia L40S GPU<br>gpu-l40s | $0.000975/sec<br>$3.51/hr | 1x | 10x | 48GB | 65GB |
| 2x Nvidia L40S GPU<br>gpu-l40s-2x | $0.001950/sec<br>$7.02/hr | 2x | 20x | 96GB | 144GB |
| Nvidia T4 GPU<br>gpu-t4 | $0.000225/sec<br>$0.81/hr | 1x | 4x | 16GB | 16GB |
| Additional hardware |
| 4x Nvidia A100 (80GB) GPU<br>gpu-a100-large-4x | $0.005600/sec<br>$20.16/hr | Additional Multi-GPU A100 capacity is available with committed spend contracts. |
| 8x Nvidia A100 (80GB) GPU<br>gpu-a100-large-8x | $0.011200/sec<br>$40.32/hr | Additional Multi-GPU A100 capacity is available with committed spend contracts. |
| 2x Nvidia H100 GPU<br>gpu-h100-2x | $0.003050/sec<br>$10.98/hr | Additional Multi-GPU H100 capacity is available with committed spend contracts. |
| 4x Nvidia H100 GPU<br>gpu-h100-4x | $0.006100/sec<br>$21.96/hr | Additional Multi-GPU H100 capacity is available with committed spend contracts. |
| 8x Nvidia H100 GPU<br>gpu-h100-8x | $0.012200/sec<br>$43.92/hr | Additional Multi-GPU H100 capacity is available with committed spend contracts. |
| 4x Nvidia L40S GPU<br>gpu-l40s-4x | $0.003900/sec<br>$14.04/hr | Additional Multi-GPU L40S capacity is available with committed spend contracts. |
| 8x Nvidia L40S GPU<br>gpu-l40s-8x | $0.007800/sec<br>$28.08/hr | Additional Multi-GPU L40S capacity is available with committed spend contracts. |

#### [Learn more](https://replicate.com/pricing\#learn-more)

For a deeper dive, check out [how billing works on Replicate](https://replicate.com/docs/billing).

#### [Enterprise & volume discounts](https://replicate.com/pricing\#enterprise)

If you need more support or have complex requirements, we can offer:

- Dedicated account manager
- Priority support
- Higher GPU limits
- Performance SLAs
- Help with onboarding, custom models, and optimizations

We've also got volume discounts for large amounts of spend. [Visit enterprise](https://replicate.com/enterprise) to learn more.