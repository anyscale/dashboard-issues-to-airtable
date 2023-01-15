// env setup
const Airtable = require("airtable");
const { Octokit } = require("@octokit/core");
const { paginateRest } = require("@octokit/plugin-paginate-rest");
require("dotenv").config();


// fetch airtable info and gh token
const oss_table = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
)(process.env.AIRTABLE_OSS_TABLE_ID);

const product_table = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
)(process.env.AIRTABLE_PRODUCT_TABLE_ID);

const octokit = new (Octokit.plugin(paginateRest))({
  auth: process.env.GH_API_TOKEN,
});


async function main() {
  
  // fetch existing oss gh issues from Airtable
  const ossIssueNumberToRecord = {};
  await oss_table
    .select({ view: "All", fields: ["Number"] })
    .eachPage((records, fetchNextPage) => {
      records.forEach((record) => {
        ossIssueNumberToRecord[record.get("Number")] = record.getId();
      });
      fetchNextPage();
    });
  console.log(
    `Fetched ${Object.keys(ossIssueNumberToRecord).length} oss gh records from airtable.`
  );
  
  // fetch existing product gh issues from Airtable
  const productIssueNumberToRecord = {};
  await product_table
    .select({ view: "All", fields: ["Number"] })
    .eachPage((records, fetchNextPage) => {
      records.forEach((record) => {
        productIssueNumberToRecord[record.get("Number")] = record.getId();
      });
      fetchNextPage();
    });
  console.log(
    `Fetched ${Object.keys(productIssueNumberToRecord).length} product gh records from airtable.`
  );

  // fetch existing oss gh issues from GH
  const ossIssues = {};
  let ossDateAfter = new Date();
  ossDateAfter.setDate(ossDateAfter.getDate() - 14);
  for await (const response of octokit.paginate.iterator(
    "GET /repos/{owner}/{repo}/issues",
    {
      owner: "ray-project",
      repo: "ray",
      since: ossDateAfter.toISOString(),
      per_page: 100,
      state: "all",
      pull_request: false,
    }
  )) {
    for (const issue of response.data) {
      ossIssues[issue.number.toString()] = {
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
  console.log(`Fetched ${Object.keys(ossIssues).length} product gh issues from github`);
  
  
  // fetch existing product gh issues from GH
  const productIssues = {};
  let productDateAfter = new Date();
  productDateAfter.setDate(productDateAfter.getDate() - 1600);
  for await (const response of octokit.paginate.iterator(
    "GET /repos/{owner}/{repo}/issues",
    {
      owner: "anyscale",
      repo: "product",
      since: productDateAfter.toISOString(),
      per_page: 100,
      state: "all",
      pull_request: false,
    }
  )) {
    for (const issue of response.data) {
      productIssues[issue.number.toString()] = {
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
  console.log(`Fetched ${Object.keys(productIssues).length} product gh issues from github`);
  
  
  
  // calculate the # of oss records to add and update
  const ossAirTableNumbers = new Set(Object.keys(ossIssueNumberToRecord));
  const ossRecordToAdd = Object.entries(ossIssues)
    .filter(([number, _]) => !ossAirTableNumbers.has(number))
    .map(([_, record]) => record);
  const ossRecordToUpdate = Object.entries(ossIssues)
    .filter(([number, _]) => ossAirTableNumbers.has(number))
    .map(([_, record]) => record);

  console.log(`Adding ${ossRecordToAdd.length} oss records`);
  
  console.log(`Updating ${ossRecordToUpdate.length} oss records`);
  
  // add new oss records
  for (let i = 0; i < ossRecordToAdd.length; i += 10) {
    const chunk = ossRecordToAdd.slice(i, i + 10);
    await oss_table.create(chunk, {
      typecast: true,
    });
  }

  // Update oss existing records
  for (let i = 0; i < ossRecordToUpdate.length; i += 10) {
    const chunk = ossRecordToUpdate.slice(i, i + 10).map((record) => ({
      id: ossIssueNumberToRecord[record.fields["Number"].toString()],
      fields: record.fields,
    }));
    await oss_table.update(chunk, {
      typecast: true,
    });
  }
  
  // calculate the # of product records to add and update
  const productAirTableNumbers = new Set(Object.keys(productIssueNumberToRecord));
  const productRecordToAdd = Object.entries(productIssues)
    .filter(([number, _]) => !productAirTableNumbers.has(number))
    .map(([_, record]) => record);
  const productRecordToUpdate = Object.entries(productIssues)
    .filter(([number, _]) => productAirTableNumbers.has(number))
    .map(([_, record]) => record);

  console.log(`Adding ${productRecordToAdd.length} product records`);
  
  console.log(`Updating ${productRecordToUpdate.length} product records`);
  
  // add new product records
  for (let i = 0; i < productRecordToAdd.length; i += 10) {
    const chunk = productRecordToAdd.slice(i, i + 10);
    await product_table.create(chunk, {
      typecast: true,
    });
  }

  // Update existing product records
  for (let i = 0; i < productRecordToUpdate.length; i += 10) {
    const chunk = productRecordToUpdate.slice(i, i + 10).map((record) => ({
      id: productIssueNumberToRecord[record.fields["Number"].toString()],
      fields: record.fields,
    }));
    await product_table.update(chunk, {
      typecast: true,
    });
  }

  console.log("Done!");
}

main().then(console.log).catch(console.error);
