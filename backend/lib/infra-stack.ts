import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /* ---------------------------------------------------------------- */
    /*  DynamoDB – meetings table                                        */
    /* ---------------------------------------------------------------- */

    const meetingsTable = new dynamodb.Table(this, 'MeetingsTable', {
      tableName: 'infinize-meetings',
      partitionKey: {
        name: 'meetingId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    /* ---------------------------------------------------------------- */
    /*  IAM managed policy – least-privilege for the app                  */
    /* ---------------------------------------------------------------- */

    const appPolicy = new iam.ManagedPolicy(this, 'AppPolicy', {
      managedPolicyName: 'InfinizeTransAppPolicy',
      statements: [
        // Amazon Chime SDK Meetings
        new iam.PolicyStatement({
          sid: 'ChimeMeetings',
          effect: iam.Effect.ALLOW,
          actions: [
            'chime:CreateMeeting',
            'chime:CreateAttendee',
            'chime:GetMeeting',
            'chime:DeleteMeeting',
            'chime:DeleteAttendee',
            'chime:ListAttendees',
          ],
          resources: ['*'],
        }),

        // Amazon Transcribe Streaming
        new iam.PolicyStatement({
          sid: 'TranscribeStreaming',
          effect: iam.Effect.ALLOW,
          actions: ['transcribe:StartStreamTranscription'],
          resources: ['*'],
        }),

        // Amazon Translate
        new iam.PolicyStatement({
          sid: 'Translate',
          effect: iam.Effect.ALLOW,
          actions: ['translate:TranslateText'],
          resources: ['*'],
        }),

        // Amazon Polly
        new iam.PolicyStatement({
          sid: 'Polly',
          effect: iam.Effect.ALLOW,
          actions: ['polly:SynthesizeSpeech'],
          resources: ['*'],
        }),

        // DynamoDB – scoped to this table
        new iam.PolicyStatement({
          sid: 'DynamoDB',
          effect: iam.Effect.ALLOW,
          actions: [
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:DeleteItem',
            'dynamodb:Query',
          ],
          resources: [meetingsTable.tableArn],
        }),

        // CloudWatch Logs
        new iam.PolicyStatement({
          sid: 'Logs',
          effect: iam.Effect.ALLOW,
          actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
          ],
          resources: ['*'],
        }),
      ],
    });

    /* ---------------------------------------------------------------- */
    /*  Outputs                                                          */
    /* ---------------------------------------------------------------- */

    new cdk.CfnOutput(this, 'MeetingsTableName', {
      value: meetingsTable.tableName,
      description: 'DynamoDB meetings table name',
    });

    new cdk.CfnOutput(this, 'AppPolicyArn', {
      value: appPolicy.managedPolicyArn,
      description: 'Attach this managed policy to your IAM user / role',
    });
  }
}
