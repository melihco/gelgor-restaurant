using Microsoft.EntityFrameworkCore;
using Nexus.Application.Security;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;

namespace Nexus.Infrastructure.Data;

public static class SeedData
{
    /// <summary>Seed demo admin e-postası (yalnızca dev / seed).</summary>
    public const string DevSeedAdminEmail = "info@sunuevent.com";

    /// <summary>
    /// Kayıt API’si en az 8 karakter ister; seed admin şifresi buna uygun olmalı.
    /// Geliştirmede veya <c>Auth:ResetDevSeedPassword</c> ile veritabanındaki hash bu metne sıfırlanır.
    /// </summary>
    public const string DevSeedAdminPlainPassword = "SmartAgency2026!";

    /// <param name="forceReset">Her başlangıçta hash’i yeniden üret (Development / Auth:ResetDevSeedPassword).</param>
    /// <param name="fillEmptyOnly">Hash boşsa doldur (Auth:EnsureSeedAdminLogin ile prod’da boş hash onarımı).</param>
    public static async Task EnsureDevSeedAdminCredentialsAsync(
        NexusDbContext context,
        bool forceReset,
        bool fillEmptyOnly)
    {
        var emailNorm = DevSeedAdminEmail.Trim().ToLowerInvariant();
        var user = await context.Users
            .FirstOrDefaultAsync(u => u.Email.ToLower() == emailNorm);

        if (user == null)
            return;

        if (!forceReset)
        {
            if (!fillEmptyOnly || !string.IsNullOrWhiteSpace(user.PasswordHash))
                return;
        }

        user.PasswordHash = Pbkdf2PasswordHasher.HashPassword(DevSeedAdminPlainPassword);
        user.UpdatedBy = user.Id;
        await context.SaveChangesAsync();
    }

    public static async Task SeedAsync(NexusDbContext context)
    {
        if (await context.Tenants.AnyAsync())
            return;

        var tenantId = new Guid("00000000-0000-0000-0000-000000000001");
        var userId = new Guid("00000000-0000-0000-0000-000000000001");
        var officeId = new Guid("00000000-0000-0000-0000-000000000002");

        var tenant = new Tenant
        {
            Id = tenantId,
            Name = "Sunu Event",
            Slug = "sunu-event",
            LogoUrl = "https://www.sunuevent.com/images/logo.png",
            Plan = "Executive",
            IsActive = true,
            Settings = "{}",
            CreatedBy = userId,
            UpdatedBy = userId
        };

        var user = new User
        {
            Id = userId,
            TenantId = tenantId,
            Email = DevSeedAdminEmail,
            DisplayName = "Sunu Event Admin",
            AvatarUrl = "https://www.sunuevent.com/images/logo.png",
            Role = "Admin",
            PasswordHash = Pbkdf2PasswordHasher.HashPassword(DevSeedAdminPlainPassword),
            IsActive = true,
            CreatedBy = userId,
            UpdatedBy = userId
        };

        var office = new Office
        {
            Id = officeId,
            TenantId = tenantId,
            Name = "Main Office",
            Description = "The primary AI Agent Office",
            IsDefault = true,
            Configuration = "{}",
            CreatedBy = userId,
            UpdatedBy = userId
        };

        var zones = new List<OfficeZone>
        {
            new()
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneType = OfficeZoneType.CommandCenter,
                Name = "Command Center",
                PositionX = 0,
                PositionY = 0,
                PositionZ = 0,
                Width = 100,
                Depth = 100,
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneType = OfficeZoneType.ContentStudio,
                Name = "Content Studio",
                PositionX = 100,
                PositionY = 0,
                PositionZ = 0,
                Width = 100,
                Depth = 100,
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneType = OfficeZoneType.DesignLab,
                Name = "Design Lab",
                PositionX = 200,
                PositionY = 0,
                PositionZ = 0,
                Width = 100,
                Depth = 100,
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneType = OfficeZoneType.MediaBay,
                Name = "Media Bay",
                PositionX = 0,
                PositionY = 100,
                PositionZ = 0,
                Width = 100,
                Depth = 100,
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneType = OfficeZoneType.AnalyticsFloor,
                Name = "Analytics Floor",
                PositionX = 100,
                PositionY = 100,
                PositionZ = 0,
                Width = 100,
                Depth = 100,
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneType = OfficeZoneType.CommunicationHub,
                Name = "Communication Hub",
                PositionX = 200,
                PositionY = 100,
                PositionZ = 0,
                Width = 100,
                Depth = 100,
                CreatedBy = userId,
                UpdatedBy = userId
            }
        };

        var agents = new List<Agent>
        {
            new()
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneId = zones[0].Id,
                AgentType = AgentType.AiCeo,
                Name = "CEO Agent",
                DisplayName = "The CEO",
                AvatarUrl = "https://example.com/agents/ceo.png",
                Description = "Executive leadership AI agent",
                State = AgentState.Idle,
                IsEnabled = true,
                DeskPositionX = 10,
                DeskPositionY = 10,
                DeskPositionZ = 0,
                SystemPrompt = "You are the AI CEO responsible for strategic decisions.",
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneId = zones[1].Id,
                AgentType = AgentType.BlogWriter,
                Name = "Blog Writer",
                DisplayName = "The Wordsmith",
                AvatarUrl = "https://example.com/agents/writer.png",
                Description = "Expert blog and content writer",
                State = AgentState.Idle,
                IsEnabled = true,
                DeskPositionX = 110,
                DeskPositionY = 10,
                DeskPositionZ = 0,
                SystemPrompt = "You are an expert blog writer creating engaging content.",
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneId = zones[1].Id,
                AgentType = AgentType.SocialMediaDesigner,
                Name = "Social Media Designer",
                DisplayName = "The Social Guru",
                AvatarUrl = "https://example.com/agents/social.png",
                Description = "Social media content and design specialist",
                State = AgentState.Idle,
                IsEnabled = true,
                DeskPositionX = 110,
                DeskPositionY = 50,
                DeskPositionZ = 0,
                SystemPrompt = "You are a social media expert creating viral content.",
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneId = zones[1].Id,
                AgentType = AgentType.ContentStrategy,
                Name = "Content Strategy",
                DisplayName = "The Content Strategist",
                AvatarUrl = "https://example.com/agents/content-strategy.png",
                Description = "Weekly mission brief and content pillar planning",
                State = AgentState.Idle,
                IsEnabled = true,
                DeskPositionX = 110,
                DeskPositionY = 70,
                DeskPositionZ = 0,
                SystemPrompt = "You decide weekly content priorities and mission briefs before Gram Master creates content.",
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneId = zones[1].Id,
                AgentType = AgentType.InstagramContentGenerator,
                Name = "Instagram Generator",
                DisplayName = "The Gram Master",
                AvatarUrl = "https://example.com/agents/instagram.png",
                Description = "Instagram-specific content creation",
                State = AgentState.Idle,
                IsEnabled = true,
                DeskPositionX = 110,
                DeskPositionY = 90,
                DeskPositionZ = 0,
                SystemPrompt = "You create stunning Instagram content and captions.",
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneId = zones[2].Id,
                AgentType = AgentType.UiUxDesigner,
                Name = "UI/UX Designer",
                DisplayName = "The Design Maverick",
                AvatarUrl = "https://example.com/agents/designer.png",
                Description = "User interface and experience design specialist",
                State = AgentState.Idle,
                IsEnabled = true,
                DeskPositionX = 210,
                DeskPositionY = 10,
                DeskPositionZ = 0,
                SystemPrompt = "You are a world-class UI/UX designer.",
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneId = zones[3].Id,
                AgentType = AgentType.VideoEditor,
                Name = "Video Editor",
                DisplayName = "The Filmmaker",
                AvatarUrl = "https://example.com/agents/video.png",
                Description = "Professional video editing and production",
                State = AgentState.Idle,
                IsEnabled = true,
                DeskPositionX = 10,
                DeskPositionY = 110,
                DeskPositionZ = 0,
                SystemPrompt = "You are an expert video editor and producer.",
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneId = zones[4].Id,
                AgentType = AgentType.SeoSpecialist,
                Name = "SEO Specialist",
                DisplayName = "The SEO Guru",
                AvatarUrl = "https://example.com/agents/seo.png",
                Description = "Search engine optimization expert",
                State = AgentState.Idle,
                IsEnabled = true,
                DeskPositionX = 110,
                DeskPositionY = 110,
                DeskPositionZ = 0,
                SystemPrompt = "You are an SEO expert optimizing for search engines.",
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneId = zones[4].Id,
                AgentType = AgentType.GoogleAdsAnalyst,
                Name = "Google Ads Analyst",
                DisplayName = "The Ads Strategist",
                AvatarUrl = "https://example.com/agents/ads.png",
                Description = "Google Ads campaign analysis and optimization",
                State = AgentState.Idle,
                IsEnabled = true,
                DeskPositionX = 110,
                DeskPositionY = 150,
                DeskPositionZ = 0,
                SystemPrompt = "You are a Google Ads expert maximizing ROI.",
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneId = zones[4].Id,
                AgentType = AgentType.AnalyticsAnalyst,
                Name = "Analytics Analyst",
                DisplayName = "The Insight Lens",
                AvatarUrl = "https://example.com/agents/analytics.png",
                Description = "Website traffic, search performance, and conversion analytics specialist",
                State = AgentState.Idle,
                IsEnabled = true,
                DeskPositionX = 150,
                DeskPositionY = 150,
                DeskPositionZ = 0,
                SystemPrompt = "You analyze GA4, Search Console, conversion, and visitor performance data.",
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneId = zones[5].Id,
                AgentType = AgentType.CustomerReviewResponder,
                Name = "Review Responder",
                DisplayName = "The Feedback Handler",
                AvatarUrl = "https://example.com/agents/reviews.png",
                Description = "Customer review management and responses",
                State = AgentState.Idle,
                IsEnabled = true,
                DeskPositionX = 210,
                DeskPositionY = 110,
                DeskPositionZ = 0,
                SystemPrompt = "You respond professionally to customer reviews.",
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneId = zones[5].Id,
                AgentType = AgentType.ChatbotManager,
                Name = "Chatbot Manager",
                DisplayName = "The Bot Master",
                AvatarUrl = "https://example.com/agents/chatbot.png",
                Description = "Chatbot development and management",
                State = AgentState.Idle,
                IsEnabled = true,
                DeskPositionX = 210,
                DeskPositionY = 150,
                DeskPositionZ = 0,
                SystemPrompt = "You manage intelligent chatbots.",
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneId = zones[0].Id,
                AgentType = AgentType.AiStrategist,
                Name = "AI Strategist",
                DisplayName = "The Strategist",
                AvatarUrl = "https://example.com/agents/strategist.png",
                Description = "AI strategy and planning specialist",
                State = AgentState.Idle,
                IsEnabled = true,
                DeskPositionX = 10,
                DeskPositionY = 50,
                DeskPositionZ = 0,
                SystemPrompt = "You develop comprehensive AI strategies.",
                CreatedBy = userId,
                UpdatedBy = userId
            }
        };

        var briefId = new Guid("00000000-0000-0000-0000-000000000003");
        var brief = new Brief
        {
            Id = briefId,
            TenantId = tenantId,
            CreatedByUserId = userId,
            Title = "2026 Bodrum Sezonu Tanıtım Kampanyası",
            Description = "Sunu Event'in 2026 yaz sezonunu tanıtmak için kapsamlı bir dijital pazarlama kampanyası",
            RawContent = "Sunu Event olarak 2026 yaz sezonunda Bodrum'daki otel ve tatil köylerine premium sahne gösterileri ve etkinlik organizasyonları sunuyoruz. 30+ özgün prodüksiyon, 300+ profesyonel personel. Instagram, Google ve dijital kanallarda hedef otellere ulaşmak için içerik üretimi ve kampanya yönetimi gerekiyor.",
            Status = BriefStatus.Draft,
            CreatedBy = userId,
            UpdatedBy = userId
        };

        // ── Package Definitions ──
        var starterPackageId = new Guid("00000000-0000-0000-0000-000000000010");
        var growthPackageId = new Guid("00000000-0000-0000-0000-000000000011");
        var performancePackageId = new Guid("00000000-0000-0000-0000-000000000012");
        var executivePackageId = new Guid("00000000-0000-0000-0000-000000000013");

        var packages = new List<PackageDefinition>
        {
            new()
            {
                Id = starterPackageId,
                Name = "Starter",
                Slug = "starter",
                Description = "Yorum yönetimi ve Instagram içerik üretimi ile hızlı başlangıç",
                MonthlyPrice = 2528m,
                YearlyPrice = 25280m,
                TaskLimitPerMonth = 50,
                IncludedAgentTypes = "[\"CustomerReviewResponder\",\"ContentStrategy\",\"InstagramContentGenerator\"]",
                Features = "[\"50 misyon/ay\",\"350 sosyal içerik\",\"20.000 SA Kredi\",\"Yorum yanıtlama\",\"E-posta destek\"]",
                SortOrder = 1,
                IsActive = true,
                IsPopular = false,
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                Id = growthPackageId,
                Name = "Growth",
                Slug = "growth",
                Description = "SEO, blog ve sosyal medya ile organik büyüme",
                MonthlyPrice = 4768m,
                YearlyPrice = 47680m,
                TaskLimitPerMonth = 120,
                IncludedAgentTypes = "[\"CustomerReviewResponder\",\"ContentStrategy\",\"InstagramContentGenerator\",\"BlogWriter\",\"SeoSpecialist\"]",
                Features = "[\"120 misyon/ay\",\"800 sosyal içerik\",\"60.000 SA Kredi\",\"Blog + SEO\",\"32 canlı yayın\"]",
                SortOrder = 2,
                IsActive = true,
                IsPopular = true,
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                Id = performancePackageId,
                Name = "Performance",
                Slug = "performance",
                Description = "Tüm içerik ve reklam agentları ile tam performans",
                MonthlyPrice = 19900m,
                YearlyPrice = 199000m,
                TaskLimitPerMonth = 260,
                IncludedAgentTypes = "[\"AiCeo\",\"CustomerReviewResponder\",\"ContentStrategy\",\"InstagramContentGenerator\",\"BlogWriter\",\"SeoSpecialist\",\"SocialMediaDesigner\",\"GoogleAdsAnalyst\",\"AnalyticsAnalyst\",\"VideoEditor\",\"UiUxDesigner\"]",
                Features = "[\"260 misyon/ay\",\"1.820 sosyal içerik\",\"160.000 SA Kredi\",\"Growth Recovery\",\"32 Runway reel\"]",
                SortOrder = 3,
                IsActive = true,
                IsPopular = false,
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                Id = executivePackageId,
                Name = "Executive",
                Slug = "executive",
                Description = "Tüm agentlar + CEO + Stratejist ile tam yönetim",
                MonthlyPrice = 15968m,
                YearlyPrice = 159680m,
                TaskLimitPerMonth = -1,
                IncludedAgentTypes = "[\"AiCeo\",\"BlogWriter\",\"SocialMediaDesigner\",\"ContentStrategy\",\"InstagramContentGenerator\",\"UiUxDesigner\",\"VideoEditor\",\"SeoSpecialist\",\"GoogleAdsAnalyst\",\"AnalyticsAnalyst\",\"CustomerReviewResponder\",\"ChatbotManager\",\"AiStrategist\"]",
                Features = "[\"Sınırsız misyon & içerik\",\"150.000 SA Kredi\",\"Tüm agentlar\",\"AI CEO\",\"Dedicated destek\"]",
                SortOrder = 4,
                IsActive = true,
                IsPopular = false,
                CreatedBy = userId,
                UpdatedBy = userId
            }
        };

        // ── Demo Subscription (Executive — full entitlement for seeded demo UX) ──
        var subscriptionId = new Guid("00000000-0000-0000-0000-000000000020");
        var subscription = new TenantSubscription
        {
            Id = subscriptionId,
            TenantId = tenantId,
            PackageId = executivePackageId,
            Status = SubscriptionStatus.Active,
            CurrentPeriodStart = DateTime.UtcNow.Date,
            CurrentPeriodEnd = DateTime.UtcNow.Date.AddMonths(1),
            TasksUsedThisPeriod = 0,
            CreatedBy = userId,
            UpdatedBy = userId
        };

        // ── Company Profile: Sunu Event Bodrum ──
        var companyProfile = new CompanyProfile
        {
            Id = new Guid("00000000-0000-0000-0000-000000000030"),
            TenantId = tenantId,
            BrandName = "Sunu Event",
            Industry = "Etkinlik & Organizasyon",
            Location = "Bodrum, Muğla, Türkiye",
            BrandTone = "premium-theatrical",
            TargetAudience = "Otel ve tatil köyleri, turizm sektörü yöneticileri, kurumsal etkinlik organizatörleri, uluslararası resort zincirler",
            VisualStyle = "Theatrical, luxury, dramatic lighting, vibrant colors, international stage production aesthetic",
            CampaignGoals = "Turizm sektöründe B2B marka bilinirliği artırmak, otellere ve resorlara sahne gösterisi satışı, uluslararası pazar genişlemesi, sosyal medyada prodüksiyon kalitesini sergilemek",
            Competitors = "Show Planet, Star Production, Antalya Show Agency",
            CustomRules = "Sunu Event 1987'den bu yana Ege turizmine hizmet veriyor. Müşteri ve çalışan memnuniyeti temel prensiptir. İçerikler Türkçe ve İngilizce üretilmeli. Bodrum ve Ege Bölgesi vurgusu yapılmalı. Dünya genelinde 4 kıta ve 20+ ülkede faaliyet gösteriliyor. 300+ profesyonel personel ve 30+ özgün sahne gösterisi. Dinner show, animasyon ekipleri, dans gösterileri, festival ve konser organizasyonları ana ürünlerdir. Olumsuz yorumlara savunmacı değil çözüm odaklı yanıt verilmeli. Alkol promosyonu içeriklerde öne çıkarılmamalı. Çocuk etkinlikleri için hafif ve eğlenceli ton kullanılmalı.",
            Languages = "tr,en",
            LogoUrl = "https://www.sunuevent.com/images/logo.png",
            WebsiteUrl = "https://www.sunuevent.com",
            Description = "Sunu Event, 1987 yılında Türk Halk Dansları gösterileriyle başlayıp bugün 4 kıtada 20+ ülkede faaliyet gösteren uluslararası bir etkinlik ve organizasyon şirketidir. Bodrum merkezli şirket; animasyon ekipleri, dans gösterileri, dinner show prodüksiyonları, festival ve konser organizasyonları ile açılış ve lansman etkinlikleri alanlarında hizmet vermektedir. 300+ profesyonel personel ve 30+ özgün sahne gösterisi ile turizm sektörüne premium etkinlik deneyimi sunar.",
            InstagramHandle = "sunuevent",
            GoogleBusinessUrl = "https://maps.app.goo.gl/SunuEventBodrum",
            BrandImageUrls = "https://www.sunuevent.com/images/logo.png,https://www.sunuevent.com/images/amblem.png",
            DefaultApprovalMode = ApprovalMode.SuggestAndWait,
            SetupCompleted = true,
            SetupCompletedAt = DateTime.UtcNow,
            CreatedBy = userId,
            UpdatedBy = userId
        };

        // ── Brand Memory Documents: Sunu Event productions & identity ──
        var brandMemories = new List<BrandMemoryDocument>
        {
            new()
            {
                TenantId = tenantId,
                DocumentType = "brand_identity",
                Title = "Sunu Event Marka Kimliği",
                Content = "Sunu Event, 1987'den bu yana Türk turizm sektörünün lider etkinlik ve organizasyon şirketidir. Bodrum merkezli, 4 kıtada 20+ ülkede faaliyet gösteren uluslararası bir markadır. Temel değerler: profesyonellik, müşteri memnuniyeti, yaratıcılık, güvenilirlik. Görsel dil: dramatik sahne aydınlatması, canlı renkler, lüks estetik, teatral atmosfer. Hedef müşteri: 4-5 yıldızlı oteller ve tatil köyleri.",
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                TenantId = tenantId,
                DocumentType = "productions",
                Title = "Flagship Prodüksiyonlar",
                Content = "CYBER (yüksek enerjili parti), CABARET (exclusive parti), D'AZZURE DINNER SHOW (çiçek temalı dinner show), MANNEQUIN (akrobasi & sahne gösterisi), BUDDHA BAR DINNER SHOW (exclusive dinner show), CIRCUS PARTY (sirk temalı parti), WHITE PARTY (dans & eğlence), PARADISE BIRDS DINNER SHOW, MEDUSA (antik tema parti), SHAMAN DANCE THEATRE (Anadolu hikayesi), MONROE (lüks deneyim), INFINITY (immersive deneyim). Tüm prodüksiyonlar profesyonel sanatçı grupları ile hayata geçirilir.",
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                TenantId = tenantId,
                DocumentType = "children_entertainment",
                Title = "Çocuk Eğlence Programları",
                Content = "KIDS SURVIVOR (spor aktiviteleri), BAZINGA (çocuklar için bilim gösterisi), KIDS FEST (çocuk dünyası), PUPPET THEATRE (kukla tiyatrosu). Çocuk içerikleri için ton: eğlenceli, renkli, güvenli, ailelere uygun. Bu kategoride alkol veya yetişkin içeriklere yer verilmez.",
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                TenantId = tenantId,
                DocumentType = "target_market",
                Title = "Hedef Pazar & B2B Satış",
                Content = "Ana hedef kitle: Bodrum ve Ege bölgesindeki 4-5 yıldızlı oteller, tatil köyleri, resort zincirler. İkincil hedef: Kurumsal etkinlik organizatörleri, düğün organizasyonu yapan firmalar. Satış argümanları: 35+ yıl deneyim, 300+ personel güvencesi, 30+ sahne gösterisi kataloğu, uluslararası sanatçı networkü, anahtar teslim organizasyon. Karar verenler: Otel entertainment müdürleri, genel müdürler, satın alma departmanları.",
                CreatedBy = userId,
                UpdatedBy = userId
            },
            new()
            {
                TenantId = tenantId,
                DocumentType = "content_guidelines",
                Title = "İçerik & Ton Kılavuzu",
                Content = "Dil: Türkçe birincil, İngilizce ikincil (uluslararası oteller için). Ton: Premium, profesyonel ama samimi ve sıcak. Görseller: Sahne ışıkları, performans anları, mutlu seyirci tepkileri, backstage momentler. Kaçınılacaklar: Rakip firma isimleri, fiyat karşılaştırmaları, aşırı alkol vurgusu. Hashtag grupları: #sunuevent #bodrum #etkinlik #organizasyon #dinnershow #entertainment #bodrumeğlence #türkiyeturizmi",
                CreatedBy = userId,
                UpdatedBy = userId
            }
        };

        context.Tenants.Add(tenant);
        context.Users.Add(user);
        context.Offices.Add(office);
        context.OfficeZones.AddRange(zones);
        context.Agents.AddRange(agents);
        context.Briefs.Add(brief);
        context.PackageDefinitions.AddRange(packages);
        context.TenantSubscriptions.Add(subscription);
        context.CompanyProfiles.Add(companyProfile);
        context.BrandMemoryDocuments.AddRange(brandMemories);

        await context.SaveChangesAsync();
    }
}
