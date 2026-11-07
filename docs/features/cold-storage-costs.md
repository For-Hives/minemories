# Cold storage class costs and choices

Documentation check of 16 October 2026. Public prices in USD, excluding taxes, discounts and future changes; no money was spent and no infrastructure was created. The AWS region below is a worked example, not the assumed deployment region.

## Chosen policy

Garage and filesystem keep archiving disabled. R2 uses only `STANDARD_IA`, which is immediately accessible; AWS accepts `STANDARD_IA`, Glacier Flexible Retrieval (`GLACIER`) or Deep Archive (`DEEP_ARCHIVE`). Hot uploads and permanent restores explicitly use `STANDARD`, even if the bucket has a different default class. The 90-day inactivity period is the initial value, configurable between 60 and 90; it does not replace the minimum billed duration after a transition.

The worker handles transitions itself. Do not add a Lifecycle rule that moves or expires its objects, its generations or the thumbnails. Keep the bucket private, without AWS versioning and without retention that blocks deletions. A shared/public read counts as a real opening; a restore request alone does not.

## R2

| Item | Standard | Infrequent Access |
| --- | ---: | ---: |
| Storage / GB-month | $0.015 | $0.010 |
| Class A operations / million | $4.50 | $9.00 |
| Class B operations / million | $0.36 | $0.90 |
| Retrieval / GB | 0 | $0.010 |
| Minimum duration | none | 30 days |

Retrieval is also billed for an IA → Standard copy; Internet egress is free. Class A includes copies, class B includes HEADs. Units are rounded up: million operations, GB-month, GB retrieved. The free tier applies only to Standard. Deletion is free, but the minimum retention is billed even if the object disappears early. [Official R2 pricing](https://developers.cloudflare.com/r2/pricing/).

Worked example: 1,000 GB for one month saves $5 of raw storage. A first batch of IA copies can cost $9 with rounding; restoring 100 GB adds $1 of retrieval. So IA guarantees no savings for a small gallery. [R2 classes and access](https://developers.cloudflare.com/r2/buckets/storage-classes/).

## AWS: Paris eu-west-3 example

| Class | Storage / GB-month | Inbound copy / 1,000 | Standard retrieval / GB | Restore requests / 1,000 |
| --- | ---: | ---: | ---: | ---: |
| Standard, first 50 TB | $0.024 | $0.0053 | — | — |
| Standard-IA | $0.0131 | $0.0100 | $0.0100 | — |
| Glacier Flexible Retrieval | $0.00405 | $0.0318 | $0.0105 | $0.0530 |
| Deep Archive | $0.0018 | $0.0600 | $0.0210 | $0.1060 |

Official machine-readable sources: [S3 Paris catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/eu-west-3/index.json), published `2026-10-15T17:35:40Z`, and [Deep Archive Paris catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3GlacierDeepArchive/current/eu-west-3/index.json), published `2026-09-11T12:45:07Z`. Copy rates correspond to `CopyObject`, restore rates to the Standard tier used by this worker. Standard HEAD/GET: $0.00042/1,000; IA: $0.001/1,000.

IA bills at least 128 KB and 30 days; Flexible at least 90 days; Deep at least 180 days. Glacier adds 40 KB of metadata per object, 8 KB of it at the Standard rate. Deleting early does not cancel the minimum. Also count the temporary restored copy, repeated HEADs, the permanent return to Standard and any network transfers; deduplicated blocks each carry their own charges. [AWS pricing and minimums](https://aws.amazon.com/s3/pricing/).

IA is immediately readable. The Standard restore tier typically takes 3–5 hours for Flexible and 12 hours for Deep, before our copy and polling. These are documented delays, not measurements from the deployment. [AWS delays](https://docs.aws.amazon.com/AmazonS3/latest/userguide/restoring-objects-retrieval-options.html).

## Evaluate before enabling

Compute per month: hot storage + cold storage + generations being cleaned up + remaining minimums + copies + HEAD/GET + GB retrieved + RestoreObject requests + temporary storage + transfers. Use the number of physical objects and transitions, not just the number of memories. Lost responses/retries and abandoned copies also cost money; our collection waits 24 h for uncertain generations.

The eligibility plan lets you price the candidate bytes and objects without starting any copy. Choose IA for interactive reopening; reserve long-delay archives for users who accept that wait. Redo the calculation in the chosen region and account before enabling. The real SDK integration is tested against isolated HTTP and real Garage for the existing flow; no restore on an AWS/R2 account and no real bill are claimed. Going live belongs to production audit #66.
