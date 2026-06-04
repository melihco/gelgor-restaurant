using Nexus.Domain.Enums;

namespace Nexus.Contracts.Dtos;

public record PackageDefinitionDto(
    Guid Id,
    string Name,
    string Slug,
    string Description,
    decimal MonthlyPrice,
    decimal YearlyPrice,
    int TaskLimitPerMonth,
    string IncludedAgentTypes,
    string Features,
    int SortOrder,
    bool IsPopular);

public record TenantSubscriptionDto(
    Guid Id,
    Guid PackageId,
    string PackageName,
    SubscriptionStatus Status,
    DateTime CurrentPeriodStart,
    DateTime CurrentPeriodEnd,
    int TasksUsedThisPeriod,
    int TaskLimit,
    List<SubscriptionAgentDto> AddOnAgents);

public record SubscriptionAgentDto(
    Guid Id,
    AgentType AgentType,
    bool IsIncluded,
    bool IsAddOn,
    decimal MonthlyPrice);

public record SelectPackageRequest(Guid PackageId);

public record PlanMonthlyOutputsDto(
    int Missions,
    int SocialContent,
    int GalleryAnalysis,
    int Reels);

public record PlanUnitEconomicsDto(
    decimal MonthlyPriceTry,
    decimal RevenueUsdEstimate,
    decimal MonthCostUsd,
    decimal MonthBilledUsd,
    decimal? CostProfitRatio,
    decimal EffectiveTokenMarginPercent,
    decimal TargetTokenMarginPercent);

public record UsageQuotaSummaryDto(
    Guid? SubscriptionId,
    string PackageName,
    string PackageSlug,
    string Status,
    DateTime? CurrentPeriodStart,
    DateTime? CurrentPeriodEnd,
    UsageQuotaMetricDto AgentRuns,
    UsageQuotaMetricDto ProviderActions,
    UsageQuotaMetricDto LiveProviderActions,
    UsageQuotaMetricDto Tokens,
    PlanMonthlyOutputsDto? MonthlyOutputs,
    PlanUnitEconomicsDto? UnitEconomics);

public record UsageQuotaMetricDto(
    int Used,
    int Limit,
    int Remaining,
    decimal PercentUsed,
    bool IsUnlimited);
