const Airtable = require("airtable");
const { Octokit } = require("@octokit/core");
const { paginateRest } = require("@octokit/plugin-paginate-rest");
require("dotenv").config();

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
)(process.env.AIRTABLE_TABLE_ID);
const octokit = new (Octokit.plugin(paginateRest))({
  auth: process.env.GH_API_TOKEN,
});

async function main() {
  const issueNumberToRecord = {};
  await base
    .select({ view: "Default", fields: ["Number"] })
    .eachPage((records, fetchNextPage) => {
      records.forEach((record) => {
        issueNumberToRecord[record.get("Number")] = record.getId();
      });
      fetchNextPage();
    });
  console.log(
    `Fetched ${Object.keys(issueNumberToRecord).length} records from airtable.`
  );

  const githubIssues = {};
  let dateAfter = new Date();
  dateAfter.setDate(dateAfter.getDate() - 14);
  for await (const response of octokit.paginate.iterator(
    "GET /repos/{owner}/{repo}/issues",
    {
      owner: "ray-project",
      repo: "ray",
      since: dateAfter.toISOString(),
      labels: ["dashboard"],
      per_page: 100,
      state: "all",
      pull_request: false,
    }
  )) {
    for (const issue of response.data) {
      githubIssues[issue.number.toString()] = {
        fields: {
          Number: issue.number,
          Title: issue.title,
          Labels: issue.labels.map((label) => label.name),
          Milestone: issue.milestone?.title,
          Link: issue.html_url,
          Assignees: issue.assignees.map((assignee) => assignee.login),  
          CreatedAt: issue.created_at,
          UpdatedAt: issue.updated_at,
          State: issue.state,
          Priority: issue.labels.filter((label) =>
            label.name.startsWith("P")
          )[0]?.name,
        },
      };
    }
  }
  console.log(`Fetched ${Object.keys(githubIssues).length} dashboard issues from github`);
  
  const githubIssues1 = {};
  let dateAfter1 = new Date();
  dateAfter1.setDate(dateAfter1.getDate() - 14);
  for await (const response1 of octokit.paginate.iterator(
    "GET /repos/{owner}/{repo}/issues",
    {
      owner: "ray-project",
      repo: "ray",
      since: dateAfter1.toISOString(),
      labels: ["observability-ux"],
      per_page: 100,
      state: "all",
      pull_request: false,
    }
  )) {
    for (const issue of response1.data) {
      githubIssues1[issue.number.toString()] = {
        fields: {
          Number: issue.number,
          Title: issue.title,
          Labels: issue.labels.map((label) => label.name),
          Milestone: issue.milestone?.title,
          Link: issue.html_url,
          Assignees: issue.assignees.map((assignee) => assignee.login),  
          CreatedAt: issue.created_at,
          UpdatedAt: issue.updated_at,
          State: issue.state,
          Priority: issue.labels.filter((label) =>
            label.name.startsWith("P")
          )[0]?.name,
        },
      };
    }
  }
  console.log(`Fetched ${Object.keys(githubIssues1).length} observability issues from github`);

  const githubIssues2 = {...githubIssues, ...githubIssues1}
  
  console.log(`Merged and got ${Object.keys(githubIssues2).length} dashboard and observability issues from github`);
  
  const airTableNumbers = new Set(Object.keys(issueNumberToRecord));
  const recordToAdd = Object.entries(githubIssues2)
    .filter(([number, _]) => !airTableNumbers.has(number))
    .map(([_, record]) => record);
  const recordToUpdate = Object.entries(githubIssues2)
    .filter(([number, _]) => airTableNumbers.has(number))
    .map(([_, record]) => record);

  console.log(`Adding ${recordToAdd.length} records`);
  
  for (let i = 0; i < recordToAdd.length; i += 10) {
    const chunk = recordToAdd.slice(i, i + 10);
    await base.create(chunk, {
      typecast: true,
    });
  }

  console.log(`Updating ${recordToUpdate.length} records`);

  for (let i = 0; i < recordToUpdate.length; i += 10) {
    const chunk = recordToUpdate.slice(i, i + 10).map((record) => ({
      id: issueNumberToRecord[record.fields["Number"].toString()],
      fields: record.fields,
    }));
    await base.update(chunk, {
      typecast: true,
    });
  }

  console.log("Done!");
}

main().then(console.log).catch(console.error);
