const core = require("@actions/core");
const github = require("@actions/github");
const lint = require("@commitlint/lint").default;
const parserPreset = require("conventional-changelog-conventionalcommits");
const { inspect } = require("util");
const { getActionConfig, getCommitSubject } = require("./utils");
const actionMessage = require("./action-message");
const getLintRules = require("./lint-rules");

async function lintPR() {
  const actionConfig = getActionConfig();
  const { GITHUB_TOKEN, COMMIT_TITLE_MATCH, IGNORE_COMMITS } = actionConfig;

  const client = github.getOctokit(GITHUB_TOKEN);

  if (!github.context.payload.pull_request) {
    core.setFailed(actionMessage.fail.pull_request.not_found);
    return;
  }

  const {
    // eslint-disable-next-line camelcase
    number: pull_number,
    base: {
      user: { login: owner },
      repo: { name: repo },
    },
  } = github.context.payload.pull_request;

  core.info(`github.context: ${inspect(github.context, { depth: null })}`);

  const { data: pullRequest } = await client.rest.pulls.get({
    owner,
    repo,
    // eslint-disable-next-line camelcase
    pull_number,
  });
  core.info(`Found PR title: ${pullRequest.title}`);

  const lintRules = await getLintRules(actionConfig);
  const {
    conventionalChangelog: { parserOpts },
  } = await parserPreset(null, null);

  if (!IGNORE_COMMITS && pullRequest.commits <= 1) {
    const {
      data: [{ commit }],
    } = await client.rest.pulls.listCommits({
      owner,
      repo,
      // eslint-disable-next-line camelcase
      pull_number,
      per_page: 1,
    });

    const commitMessageSubject = getCommitSubject(commit.message);

    const commitReport = await lint(commitMessageSubject, lintRules, {
      parserOpts,
    });

    commitReport.warnings.forEach((warn) =>
      core.warning(`Commit message: ${warn.message}`)
    );
    commitReport.errors.forEach((err) =>
      core.error(`Commit message: ${err.message}`)
    );

    if (!commitReport.valid) {
      core.setFailed(actionMessage.fail.commit.lint);
    }

    if (COMMIT_TITLE_MATCH && pullRequest.title !== commitMessageSubject) {
      core.setFailed(actionMessage.fail.commit.commit_title_match);
    }
  } else {
    const titleReport = await lint(pullRequest.title, lintRules, {
      parserOpts,
    });
    titleReport.warnings.forEach((warn) =>
      core.warning(`PR title: ${warn.message}`)
    );
    titleReport.errors.forEach((err) => core.error(`PR title: ${err.message}`));

    if (!titleReport.valid) {
      core.setFailed(actionMessage.fail.pull_request.lint);
    }
  }
}

module.exports = {
  lintPR,
};
