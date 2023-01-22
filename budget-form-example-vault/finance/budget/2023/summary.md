# All entries

## Filters

month::
tags:: 
excludeTags:: [[going out]]
from::
to::
onlyExternals::
limitEntries::

```dataviewjs
if (!dv.current()) {
  dv.header(6, "Dataview is not loaded yet!");
} else {
  const pages = dv
    .pages('"finance/budget/2023"')
    .filter((p) => p.file.path.match(/finance\/budget\/2023\/\d+\//));

  // FILTERS
  const filterMonth = dv.current().month;
  const rawFilterTags = dv.current().tags;
  const filterTags = rawFilterTags
    ? dv.array(rawFilterTags).map((t) => t.path)
    : undefined;
  const rawFilterExcludeTags = dv.current().excludeTags;
  const filterExcludeTags = rawFilterExcludeTags
    ? dv.array(rawFilterExcludeTags).map((t) => t.path)
    : undefined;
  const filterFrom = dv.current().from?.path;
  const filterTo = dv.current().to?.path;
  const filterOnlyExternals = !!dv.current().onlyExternals;
  const filterLimitEntries =
    !dv.current().limitEntries || isNaN(dv.current().limitEntries)
      ? pages.length
      : parseInt(dv.current().limitEntries);

  // Logs
  // console.log("pages", pages.values;
  // console.log("filterMonth", filterMonth;
  // console.log("filterTags", rawFilterTags);
  // console.log("filterExcludeTags", filterExcludeTags);
  // console.log("filterFrom", filterFrom);
  // console.log("filterTo", filterTo);
  // console.log("filterOnlyExternals", filterOnlyExternals);
  // console.log("filterLimitEntries",filterLimitEntries);

  // Apply filters and sorting
  const filteredPages = pages
    .filter(
      (p) =>
        !filterMonth || filterMonth === (dv.date(p.date) ?? p.file.ctime).month
    )
    .filter((p) => !filterTags || filterTags.includes(p.tag?.path))
    .filter(
      (p) => !filterExcludeTags || !filterExcludeTags.includes(p.tag?.path)
    )
    .filter((p) => !filterFrom || p["from account"]?.path === filterFrom)
    .filter((p) => !filterTo || p["to account"]?.path === filterTo)
    .filter(
      (p) =>
        !filterOnlyExternals ||
        (p["to account"] && dv.page(p["to account"].path).category === "out")
    )
    .sort((p) => p.date ?? p.file.ctime, "desc")
    .slice(0, filterLimitEntries);

  // Compute totals
  const totalAmount = filteredPages["amount"]
    .array()
    .reduce((acc, b) => acc + b, 0)
    .toFixed(2);
  // Display the table
  dv.table(
    ["Date", "Details", "Amount", "Tag", "From", "To"],
    filteredPages
      .map((p) => [
        (dv.date(p.date) ?? p.file.ctime).toFormat("D t"),
        dv.fileLink(p.file.path, false, p.details),
        p.amount,
        p.tag,
        p["from account"],
        p["to account"],
      ])
      .concat(dv.array([["Total", "---", totalAmount]]))
  );
}

```

# Balance

accountCategory:: internal

```dataviewjs
if (!dv.current()) {
  dv.header(6, "Dataview is not loaded yet!");
} else {
  const pages = dv
    .pages('"finance/budget/2023"')
    .filter((p) => p.file.path.match(/finance\/budget\/2023\/\d+\//));

  const ledgers = pages.array().reduce((acc, p) => {
    //js does not know precise math so converting to  int should do the trick for simple stuff
    const amount = p.amount * 100;
    const fromAccount = p["from account"].path;
    const toAccount = p["to account"].path;

    // Add from account to the accumulator
    acc[fromAccount] = {
      ...acc[fromAccount],
      from: (acc[fromAccount]?.from ?? 0) + amount,
    };

    // Add to account to the accumulator
    acc[toAccount] = {
      ...acc[toAccount],
      to: (acc[toAccount]?.to ?? 0) + amount,
    };

    // Add the balance to the accumulator
    acc[fromAccount] = {
      ...acc[fromAccount],
      balance: (acc[fromAccount]?.balance ?? 0) - amount,
    };
    acc[toAccount] = {
      ...acc[toAccount],
      balance: (acc[toAccount]?.balance ?? 0) + amount,
    };

    return acc;
  }, {});
  // console.log("ledgers",ledgers);

  // FILTERS
  const filterAccountCategory = dv.current().accountCategory;

  const balance = Object.entries(ledgers)
    .map(([path, ledger]) => ({
      amount: ledger.balance,
      categoryFile: dv.page(path),
    }))
    .filter(
      (e) =>
        !filterAccountCategory ||
        e.categoryFile.category === filterAccountCategory
    );

  // Display the table
  dv.table(
    ["Account", "Balance", "Category"],
    balance.map(({ amount, categoryFile }) => [
      categoryFile.file.link,
      amount / 100,
      categoryFile.category,
    ])
  );
}

```
