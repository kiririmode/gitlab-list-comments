# gitlab-list-comments
GitLab上のMRに対するコメントを一覧する

# Usage

## 事前準備

環境変数 `GITLAB_ACCESS_TOKEN` に、[Personal Access Token](https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html)を設定してください。
`read_api`スコープでの動作を確認済みです。

```shell
$ export GITLAB_ACCESS_TOKEN='YOUR_ACCESS_TOKEN'
```

必要なライブラリをインストールしてください。

```shell
$ npm install
```

## コメントの抽出

```shell
$ npx tsc  # トランスパイル
$ node dist/index.js -h
Usage: index [options]

Options:
  --repo <type>           repository (ex., "eponas/epona")
  --branch [branches...]  target branches
  -h, --help              display help for command
$ node dist/index.js --repo eponas/epona --branch main
```

実行すると JSONL 形式でコメントが出力されるので、[jq](https://stedolan.github.io/jq/)等を用いて適当に加工してください。
jq の `@csv` や `@tsv` を使えば、Excel 等の表計算ソフトへもコピペ可能です。
