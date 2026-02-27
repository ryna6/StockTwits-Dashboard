export type EconImportance = "high" | "medium" | "low";
export type GoodDirection = "higher_is_good" | "lower_is_good" | "neutral";

export type InvestingMatcher = {
  contains?: string[];
  regex?: string;
};

export type EconEventDefinition = {
  key: string;
  displayName: string;
  fredReleaseName: string;
  fredSeriesId: string;
  importance: EconImportance;
  goodDirection: GoodDirection;
  typicalTimeET?: string;
  unit?: string;
  investingMatcher: InvestingMatcher;
};

export const ECON_EVENTS_US: EconEventDefinition[] = [
  {
    key: "CPI",
    displayName: "CPI (m/m)",
    fredReleaseName: "Consumer Price Index",
    fredSeriesId: "CPIAUCSL",
    importance: "high",
    goodDirection: "lower_is_good",
    typicalTimeET: "08:30",
    unit: "index",
    investingMatcher: { contains: ["cpi", "consumer price index", "mom"] }
  },
  {
    key: "CORE_CPI",
    displayName: "Core CPI",
    fredReleaseName: "Consumer Price Index",
    fredSeriesId: "CPILFESL",
    importance: "high",
    goodDirection: "lower_is_good",
    typicalTimeET: "08:30",
    unit: "index",
    investingMatcher: { contains: ["core cpi", "excluding food", "energy"] }
  },
  {
    key: "NFP",
    displayName: "Nonfarm Payrolls",
    fredReleaseName: "Employment Situation",
    fredSeriesId: "PAYEMS",
    importance: "high",
    goodDirection: "higher_is_good",
    typicalTimeET: "08:30",
    unit: "thousands",
    investingMatcher: { contains: ["nonfarm payrolls", "nfp"] }
  },
  {
    key: "UNRATE",
    displayName: "Unemployment Rate",
    fredReleaseName: "Employment Situation",
    fredSeriesId: "UNRATE",
    importance: "high",
    goodDirection: "lower_is_good",
    typicalTimeET: "08:30",
    unit: "%",
    investingMatcher: { contains: ["unemployment rate"] }
  },
  {
    key: "RETAIL_SALES",
    displayName: "Retail Sales (m/m)",
    fredReleaseName: "Retail Sales",
    fredSeriesId: "RSAFS",
    importance: "medium",
    goodDirection: "higher_is_good",
    typicalTimeET: "08:30",
    unit: "billions",
    investingMatcher: { contains: ["retail sales", "mom"] }
  },
  {
    key: "PCE",
    displayName: "PCE Inflation",
    fredReleaseName: "Personal Income and Outlays",
    fredSeriesId: "PCEPI",
    importance: "high",
    goodDirection: "lower_is_good",
    typicalTimeET: "08:30",
    unit: "index",
    investingMatcher: { contains: ["pce", "personal consumption expenditures"] }
  },
  {
    key: "CORE_PCE",
    displayName: "Core PCE",
    fredReleaseName: "Personal Income and Outlays",
    fredSeriesId: "PCEPILFE",
    importance: "high",
    goodDirection: "lower_is_good",
    typicalTimeET: "08:30",
    unit: "index",
    investingMatcher: { contains: ["core pce"] }
  },
  {
    key: "GDP_QOQ",
    displayName: "GDP (q/q)",
    fredReleaseName: "Gross Domestic Product",
    fredSeriesId: "GDP",
    importance: "high",
    goodDirection: "higher_is_good",
    typicalTimeET: "08:30",
    unit: "billions",
    investingMatcher: { contains: ["gdp", "gross domestic product"] }
  },
  {
    key: "FOMC_RATE",
    displayName: "Fed Funds Rate",
    fredReleaseName: "FOMC",
    fredSeriesId: "FEDFUNDS",
    importance: "high",
    goodDirection: "neutral",
    typicalTimeET: "14:00",
    unit: "%",
    investingMatcher: { contains: ["fed interest rate decision", "fomc", "federal funds rate"] }
  },
  {
    key: "ISM_MANUFACTURING",
    displayName: "ISM Manufacturing PMI",
    fredReleaseName: "Institute for Supply Management",
    fredSeriesId: "NAPM",
    importance: "medium",
    goodDirection: "higher_is_good",
    typicalTimeET: "10:00",
    unit: "index",
    investingMatcher: { contains: ["ism manufacturing pmi", "manufacturing pmi"] }
  }
];

export const ECON_EVENTS_BY_KEY = new Map(ECON_EVENTS_US.map((item) => [item.key, item]));
