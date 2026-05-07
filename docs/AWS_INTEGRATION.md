# AWS Integration Guide

This guide explains how to integrate AWS services with the Learning Lab Platform for secure, temporary credential generation and resource management.

## Architecture Overview

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Browser   │────────▶│   Supabase   │────────▶│     AWS     │
│  (React UI) │         │ Edge Function│         │ STS/IAM/EC2 │
└─────────────┘         └──────────────┘         └─────────────┘
      │                        │                        │
      │                        ▼                        │
      │                  ┌──────────┐                   │
      │                  │ Postgres │                   │
      │                  │ Database │                   │
      │                  └──────────┘                   │
      │                                                 │
      └────────────── Temporary Credentials ────────────┘
```

## Core Components

### 1. AWS STS (Security Token Service)

STS generates temporary credentials with limited permissions and automatic expiration.

**Key Benefits:**
- No permanent credentials exposed
- Automatic expiration (1 hour)
- Fine-grained permission control
- Audit trail through CloudTrail

**Implementation:**

```javascript
// Supabase Edge Function - AWS STS Integration
import { STS } from 'aws-sdk';

const sts = new STS({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export async function generateTemporaryCredentials(sessionId: string) {
  const params = {
    RoleArn: process.env.AWS_LAB_ROLE_ARN,
    RoleSessionName: `lab-session-${sessionId}`,
    DurationSeconds: 3600, // 1 hour
    ExternalId: 'learning-lab-platform',
    Tags: [
      { Key: 'Environment', Value: 'LearningLab' },
      { Key: 'SessionId', Value: sessionId },
      { Key: 'ExpirationTime', Value: (Date.now() + 3600000).toString() },
    ],
  };

  const result = await sts.assumeRole(params).promise();

  return {
    accessKeyId: result.Credentials.AccessKeyId,
    secretAccessKey: result.Credentials.SecretAccessKey,
    sessionToken: result.Credentials.SessionToken,
    expiration: result.Credentials.Expiration,
  };
}
```

### 2. IAM Roles and Policies

#### Lab Environment Role

**Role Name:** `LabEnvironmentRole`

**Trust Relationship:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::YOUR_ACCOUNT_ID:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "learning-lab-platform"
        }
      }
    }
  ]
}
```

**Permission Policy:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EC2LabAccess",
      "Effect": "Allow",
      "Action": [
        "ec2:RunInstances",
        "ec2:TerminateInstances",
        "ec2:DescribeInstances",
        "ec2:DescribeInstanceStatus",
        "ec2:StopInstances",
        "ec2:StartInstances",
        "ec2:CreateTags"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "ec2:ResourceTag/Environment": "LearningLab"
        }
      }
    },
    {
      "Sid": "EC2DescribeOnly",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeImages",
        "ec2:DescribeKeyPairs",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeAvailabilityZones",
        "ec2:DescribeVpcs",
        "ec2:DescribeSubnets"
      ],
      "Resource": "*"
    },
    {
      "Sid": "S3LabAccess",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:ListBucket",
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:DeleteBucket",
        "s3:PutBucketTagging",
        "s3:GetBucketTagging"
      ],
      "Resource": [
        "arn:aws:s3:::learninglab-*",
        "arn:aws:s3:::learninglab-*/*"
      ]
    },
    {
      "Sid": "CloudWatchReadOnly",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:GetMetricStatistics",
        "cloudwatch:ListMetrics",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
        "logs:GetLogEvents",
        "logs:FilterLogEvents"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DenyDangerousActions",
      "Effect": "Deny",
      "Action": [
        "iam:*",
        "organizations:*",
        "account:*",
        "billing:*",
        "ec2:RunInstances"
      ],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "ec2:InstanceType": [
            "t2.micro",
            "t2.small",
            "t3.micro",
            "t3.small"
          ]
        }
      }
    }
  ]
}
```

### 3. Resource Tagging Strategy

All lab resources must be tagged for automatic cleanup:

```javascript
const requiredTags = [
  { Key: 'Environment', Value: 'LearningLab' },
  { Key: 'SessionId', Value: sessionId },
  { Key: 'UserId', Value: userId },
  { Key: 'ExpirationTime', Value: expirationTimestamp },
  { Key: 'ManagedBy', Value: 'LearningLabPlatform' },
];
```

**Example: Creating EC2 Instance**
```javascript
const ec2Params = {
  ImageId: 'ami-0c55b159cbfafe1f0', // Amazon Linux 2
  InstanceType: 't2.micro',
  MinCount: 1,
  MaxCount: 1,
  TagSpecifications: [
    {
      ResourceType: 'instance',
      Tags: requiredTags,
    },
  ],
};

await ec2.runInstances(ec2Params).promise();
```

### 4. Automated Resource Cleanup

#### Lambda Function: LabResourceCleanup

**File:** `lambda/cleanup.js`

```javascript
const AWS = require('aws-sdk');
const ec2 = new AWS.EC2();
const s3 = new AWS.S3();
const cloudwatch = new AWS.CloudWatch();

exports.handler = async (event) => {
    const results = {
        instancesTerminated: [],
        bucketsDeleted: [],
        errors: [],
    };

    const now = Date.now();

    try {
        // 1. Clean up expired EC2 instances
        const instances = await ec2.describeInstances({
            Filters: [
                { Name: 'tag:Environment', Values: ['LearningLab'] },
                { Name: 'instance-state-name', Values: ['running', 'stopped'] }
            ]
        }).promise();

        for (const reservation of instances.Reservations) {
            for (const instance of reservation.Instances) {
                const expirationTag = instance.Tags?.find(t => t.Key === 'ExpirationTime');
                const expirationTime = expirationTag ? parseInt(expirationTag.Value) : null;

                if (expirationTime && expirationTime < now) {
                    try {
                        await ec2.terminateInstances({ InstanceIds: [instance.InstanceId] }).promise();
                        results.instancesTerminated.push(instance.InstanceId);
                        console.log(`✓ Terminated instance: ${instance.InstanceId}`);
                    } catch (error) {
                        results.errors.push({
                            resource: instance.InstanceId,
                            error: error.message
                        });
                    }
                }
            }
        }

        // 2. Clean up expired S3 buckets
        const buckets = await s3.listBuckets().promise();
        
        for (const bucket of buckets.Buckets) {
            if (bucket.Name.startsWith('learninglab-')) {
                try {
                    const tags = await s3.getBucketTagging({ Bucket: bucket.Name }).promise();
                    const expirationTag = tags.TagSet?.find(t => t.Key === 'ExpirationTime');
                    const expirationTime = expirationTag ? parseInt(expirationTag.Value) : null;

                    if (expirationTime && expirationTime < now) {
                        // Delete all objects
                        let continuationToken;
                        do {
                            const objects = await s3.listObjectsV2({
                                Bucket: bucket.Name,
                                ContinuationToken: continuationToken
                            }).promise();

                            if (objects.Contents.length > 0) {
                                await s3.deleteObjects({
                                    Bucket: bucket.Name,
                                    Delete: {
                                        Objects: objects.Contents.map(obj => ({ Key: obj.Key }))
                                    }
                                }).promise();
                            }

                            continuationToken = objects.NextContinuationToken;
                        } while (continuationToken);

                        // Delete bucket
                        await s3.deleteBucket({ Bucket: bucket.Name }).promise();
                        results.bucketsDeleted.push(bucket.Name);
                        console.log(`✓ Deleted bucket: ${bucket.Name}`);
                    }
                } catch (error) {
                    if (error.code !== 'NoSuchTagSet') {
                        results.errors.push({
                            resource: bucket.Name,
                            error: error.message
                        });
                    }
                }
            }
        }

        // 3. Send metrics to CloudWatch
        await cloudwatch.putMetricData({
            Namespace: 'LearningLab',
            MetricData: [
                {
                    MetricName: 'InstancesTerminated',
                    Value: results.instancesTerminated.length,
                    Unit: 'Count',
                    Timestamp: new Date(),
                },
                {
                    MetricName: 'BucketsDeleted',
                    Value: results.bucketsDeleted.length,
                    Unit: 'Count',
                    Timestamp: new Date(),
                },
            ]
        }).promise();

        console.log('Cleanup completed:', results);
        return {
            statusCode: 200,
            body: JSON.stringify(results)
        };

    } catch (error) {
        console.error('Cleanup failed:', error);
        throw error;
    }
};
```

**Lambda IAM Role:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:TerminateInstances",
        "s3:ListAllMyBuckets",
        "s3:ListBucket",
        "s3:DeleteObject",
        "s3:DeleteBucket",
        "s3:GetBucketTagging",
        "cloudwatch:PutMetricData",
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

### 5. CloudWatch Monitoring

#### Metrics to Track

1. **Active Sessions**: Number of active lab sessions
2. **Resources Created**: EC2 instances, S3 buckets created per hour
3. **Cleanup Operations**: Resources cleaned up per run
4. **Failed Cleanups**: Resources that failed to cleanup
5. **Cost**: Estimated hourly cost per session

#### CloudWatch Alarms

```bash
# Alarm for high number of active instances
aws cloudwatch put-metric-alarm \
  --alarm-name learning-lab-high-instance-count \
  --alarm-description "Alert when too many lab instances are running" \
  --metric-name InstanceCount \
  --namespace LearningLab \
  --statistic Sum \
  --period 300 \
  --threshold 50 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2

# Alarm for cleanup failures
aws cloudwatch put-metric-alarm \
  --alarm-name learning-lab-cleanup-failures \
  --alarm-description "Alert when cleanup fails" \
  --metric-name CleanupErrors \
  --namespace LearningLab \
  --statistic Sum \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1
```

### 6. Cost Control

#### AWS Budget Setup

```bash
aws budgets create-budget \
  --account-id YOUR_ACCOUNT_ID \
  --budget file://budget.json \
  --notifications-with-subscribers file://notifications.json
```

**budget.json:**
```json
{
  "BudgetName": "LearningLabBudget",
  "BudgetLimit": {
    "Amount": "100",
    "Unit": "USD"
  },
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST",
  "CostFilters": {
    "TagKeyValue": ["Environment$LearningLab"]
  }
}
```

## Security Best Practices

### 1. Credential Management

✅ **DO:**
- Use STS temporary credentials only
- Rotate backend AWS credentials regularly
- Use IAM roles for EC2/Lambda
- Store secrets in AWS Secrets Manager or Supabase Vault

❌ **DON'T:**
- Expose permanent credentials in frontend
- Hard-code AWS credentials
- Share credentials across sessions
- Store credentials in version control

### 2. Network Security

- Enable VPC for lab resources
- Use security groups with minimal ingress
- Enable VPC Flow Logs
- Use AWS WAF for API protection

### 3. Audit and Compliance

- Enable AWS CloudTrail
- Log all API calls
- Store audit logs in S3
- Regular security reviews

## Troubleshooting

### Issue: AssumeRole fails

**Symptoms:** `AccessDenied` error when calling STS AssumeRole

**Solutions:**
1. Verify trust relationship in IAM role
2. Check ExternalId matches
3. Ensure calling role has `sts:AssumeRole` permission
4. Verify role ARN is correct

### Issue: Resources not cleaned up

**Symptoms:** EC2 instances or S3 buckets remain after expiration

**Solutions:**
1. Check Lambda function logs in CloudWatch
2. Verify Lambda has correct IAM permissions
3. Ensure resources are properly tagged
4. Check CloudWatch Event rule is enabled

### Issue: Permission denied errors

**Symptoms:** Users can't create resources in AWS Console

**Solutions:**
1. Verify IAM policy allows required actions
2. Check resource-based policies (S3 bucket policies)
3. Ensure condition keys match (tags, instance types)
4. Review CloudTrail for specific denied action

## Deployment Checklist

- [ ] Create IAM role with trust policy
- [ ] Attach permission policy to role
- [ ] Deploy Lambda cleanup function
- [ ] Create CloudWatch Event rule (5-minute interval)
- [ ] Set up CloudWatch alarms
- [ ] Configure AWS Budget alerts
- [ ] Enable CloudTrail logging
- [ ] Test credential generation
- [ ] Test resource creation
- [ ] Test automatic cleanup
- [ ] Configure environment variables in Supabase
- [ ] Deploy Supabase Edge Functions
- [ ] Test end-to-end flow

## Additional Resources

- [AWS STS Documentation](https://docs.aws.amazon.com/STS/latest/APIReference/welcome.html)
- [IAM Roles Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [AWS CloudTrail](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html)
- [AWS Cost Management](https://aws.amazon.com/aws-cost-management/)
