import {
  ApolloClient,
  InMemoryCache,
  HttpLink,
  from,
  ApolloQueryResult,
  NormalizedCacheObject,
} from "@apollo/client";
import { onError } from "@apollo/client/link/error";
import fetch from "cross-fetch";
import {
  MergeRequestIdsQuery,
  MergeRequestCommentsQuery,
  MergeRequestIds,
  MergeRequestComments,
} from "./generated/graphql";
import { setContext } from "@apollo/client/link/context";
import { Command } from "commander";

/**
 * GrqphQL クライアントを作成・返却する
 *
 * @returns {ApolloClient<NormalizedCacheObject>}
 */
function setupClient(): ApolloClient<NormalizedCacheObject> {
  const httpLink = new HttpLink({
    uri: "https://gitlab.com/api/graphql",
    fetch: fetch,
  });

  const authLink = setContext((_, { headers }) => {
    const accessToken = process.env.GITLAB_ACCESS_TOKEN;
    if (!accessToken) {
      process.exit(1);
    }

    return {
      headers: {
        ...headers,
        Authorization: `Bearer ${accessToken}`,
      },
    };
  });

  // エラー処理用のApollo Llink
  const errorLink = onError(({ graphQLErrors, networkError }) => {
    console.log("onError called");
    if (graphQLErrors) {
      graphQLErrors.forEach(({ message, locations, path }) => {
        console.log(
          `[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`
        );
      });
    }
    if (networkError) {
      console.log(`[Network error]: ${networkError}`);
    }
  });

  return new ApolloClient({
    link: from([errorLink, authLink, httpLink]),
    cache: new InMemoryCache(),
    queryDeduplication: true,
  });
}

/**
 * 対象リポジトリの merge 済 Merge Request の MergeRequestID 一覧を返却する
 *
 * @param {string} repository 対象リポジトリ (例: "eponas/epona")
 * @param {string[]} targetBranches ターゲットブランチ (例: "main")
 * @returns {Promise<string[]>} MergeRequestID リスト
 */
async function mergeRequestsIds(
  repository: string,
  targetBranches: string[]
): Promise<string[]> {
  let hasNextPage: boolean;
  let cursor: string | null | undefined = null;
  const mergeRequestIds: string[] = [];

  // 対象リポジトリの全 Merge Request を走査するまで繰り返す
  do {
    const result: ApolloQueryResult<MergeRequestIdsQuery> = await client.query({
      query: MergeRequestIds,
      variables: {
        fullPath: repository,
        targetBranches: targetBranches,
        afterMergeRequest: cursor,
      },
    });

    const pageInfo = result.data.project?.mergeRequests?.pageInfo;
    cursor = pageInfo?.endCursor;
    hasNextPage = pageInfo?.hasNextPage ?? false;

    // Merge RequestのID配列を蓄積する
    const idsInPage =
      result.data.project?.mergeRequests?.edges
        ?.map((edge) => edge?.node?.id)
        .filter((id): id is string => id !== undefined) ?? [];
    mergeRequestIds.push(...idsInPage);
  } while (hasNextPage);

  return mergeRequestIds;
}

/**
 * 指定した Merge Request に投稿されたコメントの一覧を JSON として出力する
 *
 * @param {string} mergeRequestId 対象の MergeRequestID
 * @returns {Promise<void>}
 */
async function notes(mergeRequestId: string): Promise<void> {
  let hasNextPage = false;
  let cursor: string | null | undefined = null;

  do {
    const result: ApolloQueryResult<MergeRequestCommentsQuery> =
      await client.query({
        query: MergeRequestComments,
        variables: {
          mergeRequestId: mergeRequestId,
          discussionsAfter: cursor,
        },
      });

    const mergeRequest = result.data.mergeRequest;
    const pageInfo = mergeRequest?.discussions.pageInfo;
    hasNextPage = pageInfo?.hasNextPage ?? false;
    cursor = pageInfo?.endCursor;

    const approvedBy =
      mergeRequest?.approvedBy?.edges
        ?.map((edge) => edge?.node?.name)
        .filter((name): name is string => name !== undefined) ?? [];

    mergeRequest?.discussions.edges
      ?.map((edge) => edge?.node?.notes.nodes)
      .flat()
      .filter((note) => !note?.system)
      .map((note) => ({
        mergeRequest: mergeRequestId,
        title: mergeRequest.title,
        approvedBy: approvedBy.join("/"),
        mergeRequestCreatedAt: mergeRequest.createdAt,
        mergeRequestMergedAt: mergeRequest.mergedAt,
        id: note?.id,
        author: note?.author.name ?? "",
        body: note?.body ?? "",
        url: note?.url ?? "",
      }))
      .forEach((e) => console.log(JSON.stringify(e)));
  } while (hasNextPage);
}

const client = setupClient();
const main = async () => {
  const program = new Command();
  program
    .requiredOption("--repo <type>", 'repository (ex., "eponas/epona")')
    .requiredOption("--branch [branches...]", "target branches");
  const opts = program.parse().opts();

  await (
    await mergeRequestsIds(opts.repo, opts.branch)
  ).forEach((id) => notes(id));
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
