import { HelpCircle } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-orange-600" />
            AWS Lab Help
          </CardTitle>
          <CardDescription>
            Follow these instructions when creating temporary resources in the AWS Console.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-600">
          <p>Start a lab first, then copy the exact values shown on the Hands-on Lab page:</p>
          <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{`Environment=LearningLab
SessionId=<exact current session id>
ExpirationTime=<exact value shown>`}</pre>
          <p>Wrong or missing tag values are rejected for Lambda, EventBridge, and DynamoDB.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Service instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible>
            <AccordionItem value="lambda">
              <AccordionTrigger>Lambda</AccordionTrigger>
              <AccordionContent className="space-y-2 text-slate-600">
                <p>1. Open Lambda and choose <strong>Create function</strong>.</p>
                <p>2. Use a name beginning with <code>learninglab-</code>.</p>
                <p>3. Choose the existing <code>interns-lambda-execution-role</code>.</p>
                <p>4. Add the three exact tags shown on the Hands-on Lab page.</p>
                <p>5. Create, update, test, and invoke the function before the session expires.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="eventbridge">
              <AccordionTrigger>EventBridge</AccordionTrigger>
              <AccordionContent className="space-y-2 text-slate-600">
                <p>1. Open Amazon EventBridge and create a rule or custom event bus.</p>
                <p>2. Use a name beginning with <code>learninglab-</code>.</p>
                <p>3. Add the three exact tags shown on the Hands-on Lab page.</p>
                <p>4. For a rule, choose its event pattern or schedule and add the permitted target.</p>
                <p>5. Rules, targets, and custom event buses belonging to the session are removed when the lab stops or expires.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="dynamodb">
              <AccordionTrigger>DynamoDB</AccordionTrigger>
              <AccordionContent className="space-y-2 text-slate-600">
                <p>1. Open DynamoDB and choose <strong>Create table</strong>.</p>
                <p>2. Use a table name beginning with <code>learninglab-</code>.</p>
                <p>3. Enter a partition key, for example <code>id</code> with type String.</p>
                <p>4. Add the three exact tags shown on the Hands-on Lab page before creating the table.</p>
                <p>5. You may add, read, update, query, scan, and delete items during the active session.</p>
                <p>6. The complete session-owned table is deleted when the lab stops or expires.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="s3">
              <AccordionTrigger>S3</AccordionTrigger>
              <AccordionContent className="space-y-2 text-slate-600">
                <p>1. Open Amazon S3 and choose <strong>Create bucket</strong>.</p>
                <p>2. Select the Mumbai region: <code>ap-south-1</code>.</p>
                <p>3. The bucket name must follow <code>learninglab-&lt;exact-session-id&gt;-&lt;unique-name&gt;</code>.</p>
                <p>4. After creation, open the bucket Properties or Tags section and add the three exact session tags.</p>
                <p>5. You may upload, read, and delete objects only inside your session-prefixed bucket.</p>
                <p>6. Stop Lab and timeout cleanup remove objects, object versions, multipart uploads, and the bucket itself.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="troubleshooting">
              <AccordionTrigger>Common errors and troubleshooting</AccordionTrigger>
              <AccordionContent className="space-y-3 text-slate-600">
                <div>
                  <p className="font-medium text-slate-900">Create action is not authorized</p>
                  <p>Check that the resource name follows the required <code>learninglab-</code> pattern and that every tag value exactly matches the Hands-on Lab page.</p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">iam:CreateRole is not authorized</p>
                  <p>Do not create a new Lambda role. Select the existing <code>interns-lambda-execution-role</code>.</p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">iam:PassRole is not authorized</p>
                  <p>Confirm that you selected the exact shared Lambda execution role rather than another IAM role.</p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">Wrong or missing tag value</p>
                  <p>Return to Hands-on Lab and copy the current <code>Environment</code>, <code>SessionId</code>, and <code>ExpirationTime</code> values again. Values from an older session will be denied.</p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">Resource was not removed</p>
                  <p>Check the name and tags first, then ask the administrator to inspect the Stop Lab response and Render cleanup logs.</p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
