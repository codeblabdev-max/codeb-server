--
-- PostgreSQL database dump
--

\restrict okeZF0cw2Bj92AJZGMoyvp4lNXpucXwBxBFgxYPcAtNV2zDb6jNullpfClvNsLh

-- Dumped from database version 17.4
-- Dumped by pg_dump version 17.6 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

DROP EVENT TRIGGER IF EXISTS pgrst_drop_watch;
DROP EVENT TRIGGER IF EXISTS pgrst_ddl_watch;
DROP EVENT TRIGGER IF EXISTS issue_pg_net_access;
DROP EVENT TRIGGER IF EXISTS issue_pg_graphql_access;
DROP EVENT TRIGGER IF EXISTS issue_pg_cron_access;
DROP EVENT TRIGGER IF EXISTS issue_graphql_placeholder;
DROP PUBLICATION IF EXISTS supabase_realtime;
ALTER TABLE IF EXISTS ONLY storage.s3_multipart_uploads_parts DROP CONSTRAINT IF EXISTS s3_multipart_uploads_parts_upload_id_fkey;
ALTER TABLE IF EXISTS ONLY storage.s3_multipart_uploads_parts DROP CONSTRAINT IF EXISTS s3_multipart_uploads_parts_bucket_id_fkey;
ALTER TABLE IF EXISTS ONLY storage.s3_multipart_uploads DROP CONSTRAINT IF EXISTS s3_multipart_uploads_bucket_id_fkey;
ALTER TABLE IF EXISTS ONLY storage.prefixes DROP CONSTRAINT IF EXISTS "prefixes_bucketId_fkey";
ALTER TABLE IF EXISTS ONLY storage.objects DROP CONSTRAINT IF EXISTS "objects_bucketId_fkey";
ALTER TABLE IF EXISTS ONLY public.withdrawal_accounts DROP CONSTRAINT IF EXISTS "withdrawal_accounts_userId_fkey";
ALTER TABLE IF EXISTS ONLY public.social_accounts DROP CONSTRAINT IF EXISTS "social_accounts_userId_fkey";
ALTER TABLE IF EXISTS ONLY public.settlements DROP CONSTRAINT IF EXISTS "settlements_influencerId_fkey";
ALTER TABLE IF EXISTS ONLY public.settlement_items DROP CONSTRAINT IF EXISTS "settlement_items_settlementId_fkey";
ALTER TABLE IF EXISTS ONLY public.settlement_items DROP CONSTRAINT IF EXISTS "settlement_items_applicationId_fkey";
ALTER TABLE IF EXISTS ONLY public.saved_campaigns DROP CONSTRAINT IF EXISTS "saved_campaigns_userId_fkey";
ALTER TABLE IF EXISTS ONLY public.saved_campaigns DROP CONSTRAINT IF EXISTS "saved_campaigns_campaignId_fkey";
ALTER TABLE IF EXISTS ONLY public.reports DROP CONSTRAINT IF EXISTS "reports_reporterId_fkey";
ALTER TABLE IF EXISTS ONLY public.refunds DROP CONSTRAINT IF EXISTS "refunds_paymentId_fkey";
ALTER TABLE IF EXISTS ONLY public.profiles DROP CONSTRAINT IF EXISTS "profiles_userId_fkey";
ALTER TABLE IF EXISTS ONLY public.posts DROP CONSTRAINT IF EXISTS "posts_authorId_fkey";
ALTER TABLE IF EXISTS ONLY public.post_translations DROP CONSTRAINT IF EXISTS "post_translations_postId_fkey";
ALTER TABLE IF EXISTS ONLY public.post_translations DROP CONSTRAINT IF EXISTS "post_translations_lastEditedBy_fkey";
ALTER TABLE IF EXISTS ONLY public.post_likes DROP CONSTRAINT IF EXISTS "post_likes_userId_fkey";
ALTER TABLE IF EXISTS ONLY public.post_likes DROP CONSTRAINT IF EXISTS "post_likes_postId_fkey";
ALTER TABLE IF EXISTS ONLY public.payments DROP CONSTRAINT IF EXISTS "payments_userId_fkey";
ALTER TABLE IF EXISTS ONLY public.payments DROP CONSTRAINT IF EXISTS "payments_campaignId_fkey";
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS "notifications_userId_fkey";
ALTER TABLE IF EXISTS ONLY public.notification_settings DROP CONSTRAINT IF EXISTS "notification_settings_userId_fkey";
ALTER TABLE IF EXISTS ONLY public.logs DROP CONSTRAINT IF EXISTS "logs_userId_fkey";
ALTER TABLE IF EXISTS ONLY public.follows DROP CONSTRAINT IF EXISTS "follows_followingId_fkey";
ALTER TABLE IF EXISTS ONLY public.follows DROP CONSTRAINT IF EXISTS "follows_followerId_fkey";
ALTER TABLE IF EXISTS ONLY public.files DROP CONSTRAINT IF EXISTS "files_userId_fkey";
ALTER TABLE IF EXISTS ONLY public.contents DROP CONSTRAINT IF EXISTS "contents_applicationId_fkey";
ALTER TABLE IF EXISTS ONLY public.content_media DROP CONSTRAINT IF EXISTS "content_media_fileId_fkey";
ALTER TABLE IF EXISTS ONLY public.content_media DROP CONSTRAINT IF EXISTS "content_media_contentId_fkey";
ALTER TABLE IF EXISTS ONLY public.comments DROP CONSTRAINT IF EXISTS "comments_postId_fkey";
ALTER TABLE IF EXISTS ONLY public.comments DROP CONSTRAINT IF EXISTS "comments_parentId_fkey";
ALTER TABLE IF EXISTS ONLY public.comments DROP CONSTRAINT IF EXISTS "comments_authorId_fkey";
ALTER TABLE IF EXISTS ONLY public.category_pages DROP CONSTRAINT IF EXISTS "category_pages_categoryId_fkey";
ALTER TABLE IF EXISTS ONLY public.categories DROP CONSTRAINT IF EXISTS "categories_parentId_fkey";
ALTER TABLE IF EXISTS ONLY public.campaigns DROP CONSTRAINT IF EXISTS "campaigns_businessId_fkey";
ALTER TABLE IF EXISTS ONLY public.campaign_translations DROP CONSTRAINT IF EXISTS "campaign_translations_lastEditedBy_fkey";
ALTER TABLE IF EXISTS ONLY public.campaign_translations DROP CONSTRAINT IF EXISTS "campaign_translations_campaignId_fkey";
ALTER TABLE IF EXISTS ONLY public.campaign_templates DROP CONSTRAINT IF EXISTS "campaign_templates_businessId_fkey";
ALTER TABLE IF EXISTS ONLY public.campaign_questions DROP CONSTRAINT IF EXISTS "campaign_questions_campaignId_fkey";
ALTER TABLE IF EXISTS ONLY public.campaign_platforms DROP CONSTRAINT IF EXISTS "campaign_platforms_campaignId_fkey";
ALTER TABLE IF EXISTS ONLY public.campaign_likes DROP CONSTRAINT IF EXISTS "campaign_likes_userId_fkey";
ALTER TABLE IF EXISTS ONLY public.campaign_likes DROP CONSTRAINT IF EXISTS "campaign_likes_campaignId_fkey";
ALTER TABLE IF EXISTS ONLY public.campaign_keywords DROP CONSTRAINT IF EXISTS "campaign_keywords_campaignId_fkey";
ALTER TABLE IF EXISTS ONLY public.campaign_images DROP CONSTRAINT IF EXISTS "campaign_images_campaignId_fkey";
ALTER TABLE IF EXISTS ONLY public.campaign_hashtags DROP CONSTRAINT IF EXISTS "campaign_hashtags_campaignId_fkey";
ALTER TABLE IF EXISTS ONLY public.campaign_categories DROP CONSTRAINT IF EXISTS "campaign_categories_categoryId_fkey";
ALTER TABLE IF EXISTS ONLY public.campaign_categories DROP CONSTRAINT IF EXISTS "campaign_categories_campaignId_fkey";
ALTER TABLE IF EXISTS ONLY public.campaign_applications DROP CONSTRAINT IF EXISTS "campaign_applications_influencerId_fkey";
ALTER TABLE IF EXISTS ONLY public.campaign_applications DROP CONSTRAINT IF EXISTS "campaign_applications_campaignId_fkey";
ALTER TABLE IF EXISTS ONLY public.business_profiles DROP CONSTRAINT IF EXISTS "business_profiles_userId_fkey";
ALTER TABLE IF EXISTS ONLY public.application_templates DROP CONSTRAINT IF EXISTS "application_templates_userId_fkey";
ALTER TABLE IF EXISTS ONLY auth.sso_domains DROP CONSTRAINT IF EXISTS sso_domains_sso_provider_id_fkey;
ALTER TABLE IF EXISTS ONLY auth.sessions DROP CONSTRAINT IF EXISTS sessions_user_id_fkey;
ALTER TABLE IF EXISTS ONLY auth.saml_relay_states DROP CONSTRAINT IF EXISTS saml_relay_states_sso_provider_id_fkey;
ALTER TABLE IF EXISTS ONLY auth.saml_relay_states DROP CONSTRAINT IF EXISTS saml_relay_states_flow_state_id_fkey;
ALTER TABLE IF EXISTS ONLY auth.saml_providers DROP CONSTRAINT IF EXISTS saml_providers_sso_provider_id_fkey;
ALTER TABLE IF EXISTS ONLY auth.refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_session_id_fkey;
ALTER TABLE IF EXISTS ONLY auth.one_time_tokens DROP CONSTRAINT IF EXISTS one_time_tokens_user_id_fkey;
ALTER TABLE IF EXISTS ONLY auth.mfa_factors DROP CONSTRAINT IF EXISTS mfa_factors_user_id_fkey;
ALTER TABLE IF EXISTS ONLY auth.mfa_challenges DROP CONSTRAINT IF EXISTS mfa_challenges_auth_factor_id_fkey;
ALTER TABLE IF EXISTS ONLY auth.mfa_amr_claims DROP CONSTRAINT IF EXISTS mfa_amr_claims_session_id_fkey;
ALTER TABLE IF EXISTS ONLY auth.identities DROP CONSTRAINT IF EXISTS identities_user_id_fkey;
DROP TRIGGER IF EXISTS update_objects_updated_at ON storage.objects;
DROP TRIGGER IF EXISTS prefixes_delete_hierarchy ON storage.prefixes;
DROP TRIGGER IF EXISTS prefixes_create_hierarchy ON storage.prefixes;
DROP TRIGGER IF EXISTS objects_update_create_prefix ON storage.objects;
DROP TRIGGER IF EXISTS objects_insert_create_prefix ON storage.objects;
DROP TRIGGER IF EXISTS objects_delete_delete_prefix ON storage.objects;
DROP TRIGGER IF EXISTS enforce_bucket_name_length_trigger ON storage.buckets;
DROP TRIGGER IF EXISTS tr_check_filters ON realtime.subscription;
DROP INDEX IF EXISTS storage.objects_bucket_id_level_idx;
DROP INDEX IF EXISTS storage.name_prefix_search;
DROP INDEX IF EXISTS storage.idx_prefixes_lower_name;
DROP INDEX IF EXISTS storage.idx_objects_lower_name;
DROP INDEX IF EXISTS storage.idx_objects_bucket_id_name;
DROP INDEX IF EXISTS storage.idx_name_bucket_level_unique;
DROP INDEX IF EXISTS storage.idx_multipart_uploads_list;
DROP INDEX IF EXISTS storage.bucketid_objname;
DROP INDEX IF EXISTS storage.bname;
DROP INDEX IF EXISTS realtime.subscription_subscription_id_entity_filters_key;
DROP INDEX IF EXISTS realtime.ix_realtime_subscription_entity;
DROP INDEX IF EXISTS public."withdrawal_accounts_userId_key";
DROP INDEX IF EXISTS public.users_email_key;
DROP INDEX IF EXISTS public."ui_sections_sectionId_key";
DROP INDEX IF EXISTS public."social_accounts_userId_provider_key";
DROP INDEX IF EXISTS public.social_accounts_provider_idx;
DROP INDEX IF EXISTS public.site_config_key_key;
DROP INDEX IF EXISTS public.site_config_key_idx;
DROP INDEX IF EXISTS public.site_config_category_idx;
DROP INDEX IF EXISTS public."saved_campaigns_userId_campaignId_key";
DROP INDEX IF EXISTS public.revenues_type_idx;
DROP INDEX IF EXISTS public.revenues_date_idx;
DROP INDEX IF EXISTS public."profiles_userId_key";
DROP INDEX IF EXISTS public."post_translations_postId_language_key";
DROP INDEX IF EXISTS public.post_translations_language_idx;
DROP INDEX IF EXISTS public."post_likes_postId_userId_key";
DROP INDEX IF EXISTS public."payments_orderId_key";
DROP INDEX IF EXISTS public."notification_settings_userId_key";
DROP INDEX IF EXISTS public."logs_userId_idx";
DROP INDEX IF EXISTS public."logs_requestId_idx";
DROP INDEX IF EXISTS public.logs_level_idx;
DROP INDEX IF EXISTS public."logs_createdAt_idx";
DROP INDEX IF EXISTS public.logs_component_idx;
DROP INDEX IF EXISTS public.language_packs_key_key;
DROP INDEX IF EXISTS public.language_packs_category_idx;
DROP INDEX IF EXISTS public.idx_users_type_status_created;
DROP INDEX IF EXISTS public.idx_users_type_lastlogin;
DROP INDEX IF EXISTS public.idx_users_type_created;
DROP INDEX IF EXISTS public.idx_users_recent_activity;
DROP INDEX IF EXISTS public.idx_users_name_email_fts;
DROP INDEX IF EXISTS public.idx_users_last_login;
DROP INDEX IF EXISTS public.idx_users_created_date_trunc;
DROP INDEX IF EXISTS public.idx_settlements_influencer_status_created;
DROP INDEX IF EXISTS public.idx_profiles_verified_created;
DROP INDEX IF EXISTS public.idx_profiles_verified;
DROP INDEX IF EXISTS public.idx_payments_status_created_amount;
DROP INDEX IF EXISTS public.idx_payments_status_amount;
DROP INDEX IF EXISTS public.idx_notifications_user_created_read;
DROP INDEX IF EXISTS public.idx_logs_level_created_user;
DROP INDEX IF EXISTS public.idx_files_user_type_created;
DROP INDEX IF EXISTS public.idx_categories_active_menu_order;
DROP INDEX IF EXISTS public.idx_campaigns_title_description_fts;
DROP INDEX IF EXISTS public.idx_campaigns_status_reward_desc;
DROP INDEX IF EXISTS public.idx_campaigns_status_enddate_asc;
DROP INDEX IF EXISTS public.idx_campaigns_status_created_business;
DROP INDEX IF EXISTS public.idx_campaigns_status_budget_desc;
DROP INDEX IF EXISTS public.idx_campaigns_recent_activity;
DROP INDEX IF EXISTS public.idx_campaigns_platforms_gin;
DROP INDEX IF EXISTS public.idx_campaigns_platform_status_created;
DROP INDEX IF EXISTS public.idx_campaigns_location_status;
DROP INDEX IF EXISTS public.idx_campaigns_hashtags_gin;
DROP INDEX IF EXISTS public.idx_campaigns_created_date_trunc;
DROP INDEX IF EXISTS public.idx_campaigns_business_status;
DROP INDEX IF EXISTS public.idx_campaigns_active_applications;
DROP INDEX IF EXISTS public.idx_campaign_questions_order;
DROP INDEX IF EXISTS public.idx_campaign_questions_campaign_id;
DROP INDEX IF EXISTS public.idx_campaign_platforms_primary;
DROP INDEX IF EXISTS public.idx_campaign_platforms_platform;
DROP INDEX IF EXISTS public.idx_campaign_platforms_campaign_id;
DROP INDEX IF EXISTS public.idx_campaign_keywords_keyword;
DROP INDEX IF EXISTS public.idx_campaign_keywords_campaign_id;
DROP INDEX IF EXISTS public.idx_campaign_images_type;
DROP INDEX IF EXISTS public.idx_campaign_images_campaign_type;
DROP INDEX IF EXISTS public.idx_campaign_images_campaign_id;
DROP INDEX IF EXISTS public.idx_campaign_hashtags_hashtag;
DROP INDEX IF EXISTS public.idx_campaign_hashtags_campaign_id;
DROP INDEX IF EXISTS public.idx_campaign_categories_category_id;
DROP INDEX IF EXISTS public.idx_campaign_categories_category_campaign;
DROP INDEX IF EXISTS public.idx_campaign_categories_campaign_id;
DROP INDEX IF EXISTS public.idx_campaign_applications_status_created;
DROP INDEX IF EXISTS public.idx_business_profiles_verified_created;
DROP INDEX IF EXISTS public.idx_business_profiles_verified;
DROP INDEX IF EXISTS public.idx_applications_recent_activity;
DROP INDEX IF EXISTS public.idx_applications_created_date_trunc;
DROP INDEX IF EXISTS public.idx_applications_campaign_status_created;
DROP INDEX IF EXISTS public."follows_followerId_followingId_key";
DROP INDEX IF EXISTS public.expenses_type_idx;
DROP INDEX IF EXISTS public.expenses_date_idx;
DROP INDEX IF EXISTS public."category_pages_isPublished_idx";
DROP INDEX IF EXISTS public."category_pages_categoryId_key";
DROP INDEX IF EXISTS public.categories_slug_key;
DROP INDEX IF EXISTS public."categories_showInMenu_idx";
DROP INDEX IF EXISTS public."categories_parentId_idx";
DROP INDEX IF EXISTS public.categories_level_idx;
DROP INDEX IF EXISTS public."categories_isActive_idx";
DROP INDEX IF EXISTS public."campaigns_status_deletedAt_idx";
DROP INDEX IF EXISTS public."campaigns_startDate_endDate_idx";
DROP INDEX IF EXISTS public."campaigns_createdAt_idx";
DROP INDEX IF EXISTS public."campaigns_businessId_status_idx";
DROP INDEX IF EXISTS public.campaign_translations_language_idx;
DROP INDEX IF EXISTS public."campaign_translations_campaignId_language_key";
DROP INDEX IF EXISTS public."campaign_templates_businessId_idx";
DROP INDEX IF EXISTS public."campaign_likes_campaignId_userId_key";
DROP INDEX IF EXISTS public."campaign_categories_categoryId_idx";
DROP INDEX IF EXISTS public."campaign_categories_campaignId_idx";
DROP INDEX IF EXISTS public."campaign_categories_campaignId_categoryId_key";
DROP INDEX IF EXISTS public."campaign_applications_campaignId_influencerId_key";
DROP INDEX IF EXISTS public."business_profiles_userId_key";
DROP INDEX IF EXISTS public."application_templates_userId_idx";
DROP INDEX IF EXISTS public."application_templates_isPublic_idx";
DROP INDEX IF EXISTS public.application_templates_category_idx;
DROP INDEX IF EXISTS public.api_config_service_key;
DROP INDEX IF EXISTS public.api_config_service_idx;
DROP INDEX IF EXISTS auth.users_is_anonymous_idx;
DROP INDEX IF EXISTS auth.users_instance_id_idx;
DROP INDEX IF EXISTS auth.users_instance_id_email_idx;
DROP INDEX IF EXISTS auth.users_email_partial_key;
DROP INDEX IF EXISTS auth.user_id_created_at_idx;
DROP INDEX IF EXISTS auth.unique_phone_factor_per_user;
DROP INDEX IF EXISTS auth.sso_providers_resource_id_idx;
DROP INDEX IF EXISTS auth.sso_domains_sso_provider_id_idx;
DROP INDEX IF EXISTS auth.sso_domains_domain_idx;
DROP INDEX IF EXISTS auth.sessions_user_id_idx;
DROP INDEX IF EXISTS auth.sessions_not_after_idx;
DROP INDEX IF EXISTS auth.saml_relay_states_sso_provider_id_idx;
DROP INDEX IF EXISTS auth.saml_relay_states_for_email_idx;
DROP INDEX IF EXISTS auth.saml_relay_states_created_at_idx;
DROP INDEX IF EXISTS auth.saml_providers_sso_provider_id_idx;
DROP INDEX IF EXISTS auth.refresh_tokens_updated_at_idx;
DROP INDEX IF EXISTS auth.refresh_tokens_session_id_revoked_idx;
DROP INDEX IF EXISTS auth.refresh_tokens_parent_idx;
DROP INDEX IF EXISTS auth.refresh_tokens_instance_id_user_id_idx;
DROP INDEX IF EXISTS auth.refresh_tokens_instance_id_idx;
DROP INDEX IF EXISTS auth.recovery_token_idx;
DROP INDEX IF EXISTS auth.reauthentication_token_idx;
DROP INDEX IF EXISTS auth.one_time_tokens_user_id_token_type_key;
DROP INDEX IF EXISTS auth.one_time_tokens_token_hash_hash_idx;
DROP INDEX IF EXISTS auth.one_time_tokens_relates_to_hash_idx;
DROP INDEX IF EXISTS auth.mfa_factors_user_id_idx;
DROP INDEX IF EXISTS auth.mfa_factors_user_friendly_name_unique;
DROP INDEX IF EXISTS auth.mfa_challenge_created_at_idx;
DROP INDEX IF EXISTS auth.idx_user_id_auth_method;
DROP INDEX IF EXISTS auth.idx_auth_code;
DROP INDEX IF EXISTS auth.identities_user_id_idx;
DROP INDEX IF EXISTS auth.identities_email_idx;
DROP INDEX IF EXISTS auth.flow_state_created_at_idx;
DROP INDEX IF EXISTS auth.factor_id_created_at_idx;
DROP INDEX IF EXISTS auth.email_change_token_new_idx;
DROP INDEX IF EXISTS auth.email_change_token_current_idx;
DROP INDEX IF EXISTS auth.confirmation_token_idx;
DROP INDEX IF EXISTS auth.audit_logs_instance_id_idx;
ALTER TABLE IF EXISTS ONLY storage.s3_multipart_uploads DROP CONSTRAINT IF EXISTS s3_multipart_uploads_pkey;
ALTER TABLE IF EXISTS ONLY storage.s3_multipart_uploads_parts DROP CONSTRAINT IF EXISTS s3_multipart_uploads_parts_pkey;
ALTER TABLE IF EXISTS ONLY storage.prefixes DROP CONSTRAINT IF EXISTS prefixes_pkey;
ALTER TABLE IF EXISTS ONLY storage.objects DROP CONSTRAINT IF EXISTS objects_pkey;
ALTER TABLE IF EXISTS ONLY storage.migrations DROP CONSTRAINT IF EXISTS migrations_pkey;
ALTER TABLE IF EXISTS ONLY storage.migrations DROP CONSTRAINT IF EXISTS migrations_name_key;
ALTER TABLE IF EXISTS ONLY storage.buckets DROP CONSTRAINT IF EXISTS buckets_pkey;
ALTER TABLE IF EXISTS ONLY storage.buckets_analytics DROP CONSTRAINT IF EXISTS buckets_analytics_pkey;
ALTER TABLE IF EXISTS ONLY realtime.schema_migrations DROP CONSTRAINT IF EXISTS schema_migrations_pkey;
ALTER TABLE IF EXISTS ONLY realtime.subscription DROP CONSTRAINT IF EXISTS pk_subscription;
ALTER TABLE IF EXISTS ONLY realtime.messages DROP CONSTRAINT IF EXISTS messages_pkey;
ALTER TABLE IF EXISTS ONLY public.withdrawal_accounts DROP CONSTRAINT IF EXISTS withdrawal_accounts_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.ui_sections DROP CONSTRAINT IF EXISTS ui_sections_pkey;
ALTER TABLE IF EXISTS ONLY public.social_accounts DROP CONSTRAINT IF EXISTS social_accounts_pkey;
ALTER TABLE IF EXISTS ONLY public.site_config DROP CONSTRAINT IF EXISTS site_config_pkey;
ALTER TABLE IF EXISTS ONLY public.settlements DROP CONSTRAINT IF EXISTS settlements_pkey;
ALTER TABLE IF EXISTS ONLY public.settlement_items DROP CONSTRAINT IF EXISTS settlement_items_pkey;
ALTER TABLE IF EXISTS ONLY public.saved_campaigns DROP CONSTRAINT IF EXISTS saved_campaigns_pkey;
ALTER TABLE IF EXISTS ONLY public.revenues DROP CONSTRAINT IF EXISTS revenues_pkey;
ALTER TABLE IF EXISTS ONLY public.reports DROP CONSTRAINT IF EXISTS reports_pkey;
ALTER TABLE IF EXISTS ONLY public.refunds DROP CONSTRAINT IF EXISTS refunds_pkey;
ALTER TABLE IF EXISTS ONLY public.profiles DROP CONSTRAINT IF EXISTS profiles_pkey;
ALTER TABLE IF EXISTS ONLY public.posts DROP CONSTRAINT IF EXISTS posts_pkey;
ALTER TABLE IF EXISTS ONLY public.post_translations DROP CONSTRAINT IF EXISTS post_translations_pkey;
ALTER TABLE IF EXISTS ONLY public.post_likes DROP CONSTRAINT IF EXISTS post_likes_pkey;
ALTER TABLE IF EXISTS ONLY public.payments DROP CONSTRAINT IF EXISTS payments_pkey;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_pkey;
ALTER TABLE IF EXISTS ONLY public.notification_settings DROP CONSTRAINT IF EXISTS notification_settings_pkey;
ALTER TABLE IF EXISTS ONLY public.logs DROP CONSTRAINT IF EXISTS logs_pkey;
ALTER TABLE IF EXISTS ONLY public.language_packs DROP CONSTRAINT IF EXISTS language_packs_pkey;
ALTER TABLE IF EXISTS ONLY public.follows DROP CONSTRAINT IF EXISTS follows_pkey;
ALTER TABLE IF EXISTS ONLY public.files DROP CONSTRAINT IF EXISTS files_pkey;
ALTER TABLE IF EXISTS ONLY public.expenses DROP CONSTRAINT IF EXISTS expenses_pkey;
ALTER TABLE IF EXISTS ONLY public.contents DROP CONSTRAINT IF EXISTS contents_pkey;
ALTER TABLE IF EXISTS ONLY public.content_media DROP CONSTRAINT IF EXISTS content_media_pkey;
ALTER TABLE IF EXISTS ONLY public.comments DROP CONSTRAINT IF EXISTS comments_pkey;
ALTER TABLE IF EXISTS ONLY public.category_pages DROP CONSTRAINT IF EXISTS category_pages_pkey;
ALTER TABLE IF EXISTS ONLY public.categories DROP CONSTRAINT IF EXISTS categories_pkey;
ALTER TABLE IF EXISTS ONLY public.campaigns DROP CONSTRAINT IF EXISTS campaigns_pkey;
ALTER TABLE IF EXISTS ONLY public.campaign_translations DROP CONSTRAINT IF EXISTS campaign_translations_pkey;
ALTER TABLE IF EXISTS ONLY public.campaign_templates DROP CONSTRAINT IF EXISTS campaign_templates_pkey;
ALTER TABLE IF EXISTS ONLY public.campaign_questions DROP CONSTRAINT IF EXISTS campaign_questions_pkey;
ALTER TABLE IF EXISTS ONLY public.campaign_platforms DROP CONSTRAINT IF EXISTS campaign_platforms_pkey;
ALTER TABLE IF EXISTS ONLY public.campaign_platforms DROP CONSTRAINT IF EXISTS "campaign_platforms_campaignId_platform_key";
ALTER TABLE IF EXISTS ONLY public.campaign_likes DROP CONSTRAINT IF EXISTS campaign_likes_pkey;
ALTER TABLE IF EXISTS ONLY public.campaign_keywords DROP CONSTRAINT IF EXISTS campaign_keywords_pkey;
ALTER TABLE IF EXISTS ONLY public.campaign_keywords DROP CONSTRAINT IF EXISTS "campaign_keywords_campaignId_keyword_key";
ALTER TABLE IF EXISTS ONLY public.campaign_images DROP CONSTRAINT IF EXISTS campaign_images_pkey;
ALTER TABLE IF EXISTS ONLY public.campaign_hashtags DROP CONSTRAINT IF EXISTS campaign_hashtags_pkey;
ALTER TABLE IF EXISTS ONLY public.campaign_hashtags DROP CONSTRAINT IF EXISTS "campaign_hashtags_campaignId_hashtag_key";
ALTER TABLE IF EXISTS ONLY public.campaign_categories DROP CONSTRAINT IF EXISTS campaign_categories_pkey;
ALTER TABLE IF EXISTS ONLY public.campaign_applications DROP CONSTRAINT IF EXISTS campaign_applications_pkey;
ALTER TABLE IF EXISTS ONLY public.business_profiles DROP CONSTRAINT IF EXISTS business_profiles_pkey;
ALTER TABLE IF EXISTS ONLY public.application_templates DROP CONSTRAINT IF EXISTS application_templates_pkey;
ALTER TABLE IF EXISTS ONLY public.api_config DROP CONSTRAINT IF EXISTS api_config_pkey;
ALTER TABLE IF EXISTS ONLY auth.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY auth.users DROP CONSTRAINT IF EXISTS users_phone_key;
ALTER TABLE IF EXISTS ONLY auth.sso_providers DROP CONSTRAINT IF EXISTS sso_providers_pkey;
ALTER TABLE IF EXISTS ONLY auth.sso_domains DROP CONSTRAINT IF EXISTS sso_domains_pkey;
ALTER TABLE IF EXISTS ONLY auth.sessions DROP CONSTRAINT IF EXISTS sessions_pkey;
ALTER TABLE IF EXISTS ONLY auth.schema_migrations DROP CONSTRAINT IF EXISTS schema_migrations_pkey;
ALTER TABLE IF EXISTS ONLY auth.saml_relay_states DROP CONSTRAINT IF EXISTS saml_relay_states_pkey;
ALTER TABLE IF EXISTS ONLY auth.saml_providers DROP CONSTRAINT IF EXISTS saml_providers_pkey;
ALTER TABLE IF EXISTS ONLY auth.saml_providers DROP CONSTRAINT IF EXISTS saml_providers_entity_id_key;
ALTER TABLE IF EXISTS ONLY auth.refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_token_unique;
ALTER TABLE IF EXISTS ONLY auth.refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_pkey;
ALTER TABLE IF EXISTS ONLY auth.one_time_tokens DROP CONSTRAINT IF EXISTS one_time_tokens_pkey;
ALTER TABLE IF EXISTS ONLY auth.mfa_factors DROP CONSTRAINT IF EXISTS mfa_factors_pkey;
ALTER TABLE IF EXISTS ONLY auth.mfa_factors DROP CONSTRAINT IF EXISTS mfa_factors_last_challenged_at_key;
ALTER TABLE IF EXISTS ONLY auth.mfa_challenges DROP CONSTRAINT IF EXISTS mfa_challenges_pkey;
ALTER TABLE IF EXISTS ONLY auth.mfa_amr_claims DROP CONSTRAINT IF EXISTS mfa_amr_claims_session_id_authentication_method_pkey;
ALTER TABLE IF EXISTS ONLY auth.instances DROP CONSTRAINT IF EXISTS instances_pkey;
ALTER TABLE IF EXISTS ONLY auth.identities DROP CONSTRAINT IF EXISTS identities_provider_id_provider_unique;
ALTER TABLE IF EXISTS ONLY auth.identities DROP CONSTRAINT IF EXISTS identities_pkey;
ALTER TABLE IF EXISTS ONLY auth.flow_state DROP CONSTRAINT IF EXISTS flow_state_pkey;
ALTER TABLE IF EXISTS ONLY auth.audit_log_entries DROP CONSTRAINT IF EXISTS audit_log_entries_pkey;
ALTER TABLE IF EXISTS ONLY auth.mfa_amr_claims DROP CONSTRAINT IF EXISTS amr_id_pk;
ALTER TABLE IF EXISTS auth.refresh_tokens ALTER COLUMN id DROP DEFAULT;
DROP TABLE IF EXISTS storage.s3_multipart_uploads_parts;
DROP TABLE IF EXISTS storage.s3_multipart_uploads;
DROP TABLE IF EXISTS storage.prefixes;
DROP TABLE IF EXISTS storage.objects;
DROP TABLE IF EXISTS storage.migrations;
DROP TABLE IF EXISTS storage.buckets_analytics;
DROP TABLE IF EXISTS storage.buckets;
DROP TABLE IF EXISTS realtime.subscription;
DROP TABLE IF EXISTS realtime.schema_migrations;
DROP TABLE IF EXISTS realtime.messages;
DROP TABLE IF EXISTS public.withdrawal_accounts;
DROP VIEW IF EXISTS public.user_complete;
DROP TABLE IF EXISTS public.ui_sections;
DROP TABLE IF EXISTS public.social_accounts;
DROP TABLE IF EXISTS public.site_config;
DROP TABLE IF EXISTS public.settlements;
DROP TABLE IF EXISTS public.settlement_items;
DROP TABLE IF EXISTS public.saved_campaigns;
DROP TABLE IF EXISTS public.revenues;
DROP TABLE IF EXISTS public.reports;
DROP TABLE IF EXISTS public.refunds;
DROP TABLE IF EXISTS public.posts;
DROP TABLE IF EXISTS public.post_translations;
DROP TABLE IF EXISTS public.post_likes;
DROP TABLE IF EXISTS public.notifications;
DROP TABLE IF EXISTS public.notification_settings;
DROP TABLE IF EXISTS public.logs;
DROP TABLE IF EXISTS public.language_packs;
DROP VIEW IF EXISTS public.index_usage_stats;
DROP TABLE IF EXISTS public.follows;
DROP TABLE IF EXISTS public.files;
DROP TABLE IF EXISTS public.expenses;
DROP TABLE IF EXISTS public.content_media;
DROP TABLE IF EXISTS public.comments;
DROP TABLE IF EXISTS public.category_pages;
DROP VIEW IF EXISTS public.campaign_with_stats;
DROP TABLE IF EXISTS public.contents;
DROP VIEW IF EXISTS public.campaign_with_categories;
DROP VIEW IF EXISTS public.campaign_with_business;
DROP TABLE IF EXISTS public.campaign_translations;
DROP TABLE IF EXISTS public.campaign_templates;
DROP TABLE IF EXISTS public.campaign_questions;
DROP VIEW IF EXISTS public.campaign_normalized;
DROP TABLE IF EXISTS public.campaign_platforms;
DROP TABLE IF EXISTS public.campaign_likes;
DROP TABLE IF EXISTS public.campaign_keywords;
DROP TABLE IF EXISTS public.campaign_images;
DROP TABLE IF EXISTS public.campaign_hashtags;
DROP VIEW IF EXISTS public.campaign_complete;
DROP TABLE IF EXISTS public.categories;
DROP TABLE IF EXISTS public.campaign_categories;
DROP TABLE IF EXISTS public.application_templates;
DROP TABLE IF EXISTS public.api_config;
DROP VIEW IF EXISTS public.admin_dashboard_stats;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.profiles;
DROP TABLE IF EXISTS public.payments;
DROP TABLE IF EXISTS public.campaigns;
DROP TABLE IF EXISTS public.campaign_applications;
DROP TABLE IF EXISTS public.business_profiles;
DROP TABLE IF EXISTS auth.users;
DROP TABLE IF EXISTS auth.sso_providers;
DROP TABLE IF EXISTS auth.sso_domains;
DROP TABLE IF EXISTS auth.sessions;
DROP TABLE IF EXISTS auth.schema_migrations;
DROP TABLE IF EXISTS auth.saml_relay_states;
DROP TABLE IF EXISTS auth.saml_providers;
DROP SEQUENCE IF EXISTS auth.refresh_tokens_id_seq;
DROP TABLE IF EXISTS auth.refresh_tokens;
DROP TABLE IF EXISTS auth.one_time_tokens;
DROP TABLE IF EXISTS auth.mfa_factors;
DROP TABLE IF EXISTS auth.mfa_challenges;
DROP TABLE IF EXISTS auth.mfa_amr_claims;
DROP TABLE IF EXISTS auth.instances;
DROP TABLE IF EXISTS auth.identities;
DROP TABLE IF EXISTS auth.flow_state;
DROP TABLE IF EXISTS auth.audit_log_entries;
DROP FUNCTION IF EXISTS storage.update_updated_at_column();
DROP FUNCTION IF EXISTS storage.search_v2(prefix text, bucket_name text, limits integer, levels integer, start_after text);
DROP FUNCTION IF EXISTS storage.search_v1_optimised(prefix text, bucketname text, limits integer, levels integer, offsets integer, search text, sortcolumn text, sortorder text);
DROP FUNCTION IF EXISTS storage.search_legacy_v1(prefix text, bucketname text, limits integer, levels integer, offsets integer, search text, sortcolumn text, sortorder text);
DROP FUNCTION IF EXISTS storage.search(prefix text, bucketname text, limits integer, levels integer, offsets integer, search text, sortcolumn text, sortorder text);
DROP FUNCTION IF EXISTS storage.prefixes_insert_trigger();
DROP FUNCTION IF EXISTS storage.operation();
DROP FUNCTION IF EXISTS storage.objects_update_prefix_trigger();
DROP FUNCTION IF EXISTS storage.objects_insert_prefix_trigger();
DROP FUNCTION IF EXISTS storage.list_objects_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer, start_after text, next_token text);
DROP FUNCTION IF EXISTS storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer, next_key_token text, next_upload_token text);
DROP FUNCTION IF EXISTS storage.get_size_by_bucket();
DROP FUNCTION IF EXISTS storage.get_prefixes(name text);
DROP FUNCTION IF EXISTS storage.get_prefix(name text);
DROP FUNCTION IF EXISTS storage.get_level(name text);
DROP FUNCTION IF EXISTS storage.foldername(name text);
DROP FUNCTION IF EXISTS storage.filename(name text);
DROP FUNCTION IF EXISTS storage.extension(name text);
DROP FUNCTION IF EXISTS storage.enforce_bucket_name_length();
DROP FUNCTION IF EXISTS storage.delete_prefix_hierarchy_trigger();
DROP FUNCTION IF EXISTS storage.delete_prefix(_bucket_id text, _name text);
DROP FUNCTION IF EXISTS storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb);
DROP FUNCTION IF EXISTS storage.add_prefixes(_bucket_id text, _name text);
DROP FUNCTION IF EXISTS realtime.topic();
DROP FUNCTION IF EXISTS realtime.to_regrole(role_name text);
DROP FUNCTION IF EXISTS realtime.subscription_check_filters();
DROP FUNCTION IF EXISTS realtime.send(payload jsonb, event text, topic text, private boolean);
DROP FUNCTION IF EXISTS realtime.quote_wal2json(entity regclass);
DROP FUNCTION IF EXISTS realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer);
DROP FUNCTION IF EXISTS realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]);
DROP FUNCTION IF EXISTS realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text);
DROP FUNCTION IF EXISTS realtime."cast"(val text, type_ regtype);
DROP FUNCTION IF EXISTS realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]);
DROP FUNCTION IF EXISTS realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text);
DROP FUNCTION IF EXISTS realtime.apply_rls(wal jsonb, max_record_bytes integer);
DROP FUNCTION IF EXISTS public.migrate_campaign_platforms();
DROP FUNCTION IF EXISTS public.migrate_campaign_keywords();
DROP FUNCTION IF EXISTS public.migrate_campaign_images();
DROP FUNCTION IF EXISTS public.migrate_campaign_hashtags();
DROP FUNCTION IF EXISTS public.generate_random_uuid();
DROP FUNCTION IF EXISTS pgbouncer.get_auth(p_usename text);
DROP FUNCTION IF EXISTS extensions.set_graphql_placeholder();
DROP FUNCTION IF EXISTS extensions.pgrst_drop_watch();
DROP FUNCTION IF EXISTS extensions.pgrst_ddl_watch();
DROP FUNCTION IF EXISTS extensions.grant_pg_net_access();
DROP FUNCTION IF EXISTS extensions.grant_pg_graphql_access();
DROP FUNCTION IF EXISTS extensions.grant_pg_cron_access();
DROP FUNCTION IF EXISTS auth.uid();
DROP FUNCTION IF EXISTS auth.role();
DROP FUNCTION IF EXISTS auth.jwt();
DROP FUNCTION IF EXISTS auth.email();
DROP TYPE IF EXISTS storage.buckettype;
DROP TYPE IF EXISTS realtime.wal_rls;
DROP TYPE IF EXISTS realtime.wal_column;
DROP TYPE IF EXISTS realtime.user_defined_filter;
DROP TYPE IF EXISTS realtime.equality_op;
DROP TYPE IF EXISTS realtime.action;
DROP TYPE IF EXISTS public."UserType";
DROP TYPE IF EXISTS public."PaymentStatus";
DROP TYPE IF EXISTS public."CampaignStatus";
DROP TYPE IF EXISTS public."ApplicationStatus";
DROP TYPE IF EXISTS auth.one_time_token_type;
DROP TYPE IF EXISTS auth.factor_type;
DROP TYPE IF EXISTS auth.factor_status;
DROP TYPE IF EXISTS auth.code_challenge_method;
DROP TYPE IF EXISTS auth.aal_level;
DROP EXTENSION IF EXISTS "uuid-ossp";
DROP EXTENSION IF EXISTS supabase_vault;
DROP EXTENSION IF EXISTS pgcrypto;
DROP EXTENSION IF EXISTS pg_stat_statements;
DROP EXTENSION IF EXISTS pg_graphql;
DROP SCHEMA IF EXISTS vault;
DROP SCHEMA IF EXISTS storage;
DROP SCHEMA IF EXISTS realtime;
-- *not* dropping schema, since initdb creates it
DROP SCHEMA IF EXISTS pgbouncer;
DROP SCHEMA IF EXISTS graphql_public;
DROP SCHEMA IF EXISTS graphql;
DROP SCHEMA IF EXISTS extensions;
DROP SCHEMA IF EXISTS auth;
--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql;


--
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql_public;


--
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pgbouncer;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA realtime;


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: vault; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA vault;


--
-- Name: pg_graphql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_graphql WITH SCHEMA graphql;


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- Name: ApplicationStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ApplicationStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


--
-- Name: CampaignStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CampaignStatus" AS ENUM (
    'DRAFT',
    'PENDING_REVIEW',
    'ACTIVE',
    'PAUSED',
    'COMPLETED',
    'REJECTED'
);


--
-- Name: PaymentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PaymentStatus" AS ENUM (
    'PENDING',
    'COMPLETED',
    'FAILED',
    'CANCELLED',
    'PARTIAL_REFUNDED',
    'REFUNDED'
);


--
-- Name: UserType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UserType" AS ENUM (
    'ADMIN',
    'BUSINESS',
    'INFLUENCER'
);


--
-- Name: action; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


--
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.equality_op AS ENUM (
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'in'
);


--
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text
);


--
-- Name: wal_column; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_column AS (
	name text,
	type_name text,
	type_oid oid,
	value jsonb,
	is_pkey boolean,
	is_selectable boolean
);


--
-- Name: wal_rls; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_rls AS (
	wal jsonb,
	is_rls_enabled boolean,
	subscription_ids uuid[],
	errors text[]
);


--
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: -
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS'
);


--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


--
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
  END IF;
END;
$$;


--
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    func_is_graphql_resolve bool;
BEGIN
    func_is_graphql_resolve = (
        SELECT n.proname = 'resolve'
        FROM pg_event_trigger_ddl_commands() AS ev
        LEFT JOIN pg_catalog.pg_proc AS n
        ON ev.objid = n.oid
    );

    IF func_is_graphql_resolve
    THEN
        -- Update public wrapper to pass all arguments through to the pg_graphql resolve func
        DROP FUNCTION IF EXISTS graphql_public.graphql;
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language sql
        as $$
            select graphql.resolve(
                query := query,
                variables := coalesce(variables, '{}'),
                "operationName" := "operationName",
                extensions := extensions
            );
        $$;

        -- This hook executes when `graphql.resolve` is created. That is not necessarily the last
        -- function in the extension so we need to grant permissions on existing entities AND
        -- update default permissions to any others that are created after `graphql.resolve`
        grant usage on schema graphql to postgres, anon, authenticated, service_role;
        grant select on all tables in schema graphql to postgres, anon, authenticated, service_role;
        grant execute on all functions in schema graphql to postgres, anon, authenticated, service_role;
        grant all on all sequences in schema graphql to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on tables to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on functions to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on sequences to postgres, anon, authenticated, service_role;

        -- Allow postgres role to allow granting usage on graphql and graphql_public schemas to custom roles
        grant usage on schema graphql_public to postgres with grant option;
        grant usage on schema graphql to postgres with grant option;
    END IF;

END;
$_$;


--
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$$;


--
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


--
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: -
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
begin
    raise debug 'PgBouncer auth request: %', p_usename;

    return query
    select 
        rolname::text, 
        case when rolvaliduntil < now() 
            then null 
            else rolpassword::text 
        end 
    from pg_authid 
    where rolname=$1 and rolcanlogin;
end;
$_$;


--
-- Name: generate_random_uuid(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_random_uuid() RETURNS text
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN encode(gen_random_bytes(12), 'base64')::TEXT;
END;
$$;


--
-- Name: migrate_campaign_hashtags(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.migrate_campaign_hashtags() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    campaign_record RECORD;
    hashtag_item TEXT;
    hashtag_array TEXT[];
    counter INTEGER;
BEGIN
    FOR campaign_record IN 
        SELECT id, hashtags FROM campaigns 
        WHERE hashtags IS NOT NULL AND hashtags != 'null'
    LOOP
        -- JSON 배열인 경우
        IF LEFT(campaign_record.hashtags, 1) = '[' THEN
            hashtag_array := ARRAY(SELECT jsonb_array_elements_text(campaign_record.hashtags::jsonb));
        -- 문자열인 경우 공백으로 분리
        ELSE
            hashtag_array := string_to_array(campaign_record.hashtags, ' ');
        END IF;
        
        counter := 0;
        FOREACH hashtag_item IN ARRAY hashtag_array
        LOOP
            -- # 제거하고 빈 문자열 제외
            hashtag_item := TRIM(REPLACE(hashtag_item, '#', ''));
            IF LENGTH(hashtag_item) > 0 THEN
                INSERT INTO campaign_hashtags (id, "campaignId", hashtag, "order")
                VALUES (
                    generate_random_uuid(),
                    campaign_record.id,
                    hashtag_item,
                    counter
                )
                ON CONFLICT ("campaignId", hashtag) DO NOTHING;
                counter := counter + 1;
            END IF;
        END LOOP;
    END LOOP;
END;
$$;


--
-- Name: migrate_campaign_images(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.migrate_campaign_images() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    campaign_record RECORD;
    image_item JSONB;
    counter INTEGER;
BEGIN
    FOR campaign_record IN 
        SELECT id, "imageUrl", "headerImageUrl", "thumbnailImageUrl", 
               "detailImages", "productImages"
        FROM campaigns 
    LOOP
        counter := 0;
        
        -- 기본 이미지들 처리
        IF campaign_record."imageUrl" IS NOT NULL THEN
            INSERT INTO campaign_images (id, "campaignId", "imageUrl", type, "order")
            VALUES (generate_random_uuid(), campaign_record.id, campaign_record."imageUrl", 'MAIN', counter);
            counter := counter + 1;
        END IF;
        
        IF campaign_record."headerImageUrl" IS NOT NULL THEN
            INSERT INTO campaign_images (id, "campaignId", "imageUrl", type, "order")
            VALUES (generate_random_uuid(), campaign_record.id, campaign_record."headerImageUrl", 'HEADER', counter);
            counter := counter + 1;
        END IF;
        
        IF campaign_record."thumbnailImageUrl" IS NOT NULL THEN
            INSERT INTO campaign_images (id, "campaignId", "imageUrl", type, "order")
            VALUES (generate_random_uuid(), campaign_record.id, campaign_record."thumbnailImageUrl", 'THUMBNAIL', counter);
            counter := counter + 1;
        END IF;
        
        -- detailImages JSON 처리
        IF campaign_record."detailImages" IS NOT NULL AND campaign_record."detailImages" != 'null' THEN
            FOR image_item IN SELECT * FROM jsonb_array_elements(campaign_record."detailImages"::jsonb)
            LOOP
                INSERT INTO campaign_images (id, "campaignId", "imageUrl", type, "order")
                VALUES (
                    generate_random_uuid(), 
                    campaign_record.id, 
                    image_item->>'url', 
                    'DETAIL', 
                    counter
                );
                counter := counter + 1;
            END LOOP;
        END IF;
        
        -- productImages JSON 처리
        IF campaign_record."productImages" IS NOT NULL AND campaign_record."productImages" != 'null' THEN
            FOR image_item IN SELECT * FROM jsonb_array_elements(campaign_record."productImages"::jsonb)
            LOOP
                INSERT INTO campaign_images (id, "campaignId", "imageUrl", type, "order")
                VALUES (
                    generate_random_uuid(), 
                    campaign_record.id, 
                    image_item->>'url', 
                    'PRODUCT', 
                    counter
                );
                counter := counter + 1;
            END LOOP;
        END IF;
    END LOOP;
END;
$$;


--
-- Name: migrate_campaign_keywords(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.migrate_campaign_keywords() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    campaign_record RECORD;
    keyword_item TEXT;
    keyword_array TEXT[];
    counter INTEGER;
BEGIN
    FOR campaign_record IN 
        SELECT id, keywords FROM campaigns 
        WHERE keywords IS NOT NULL AND keywords != ''
    LOOP
        keyword_array := string_to_array(campaign_record.keywords, ',');
        counter := 1;
        
        FOREACH keyword_item IN ARRAY keyword_array
        LOOP
            keyword_item := TRIM(keyword_item);
            IF LENGTH(keyword_item) > 0 THEN
                INSERT INTO campaign_keywords (id, "campaignId", keyword, weight)
                VALUES (
                    generate_random_uuid(),
                    campaign_record.id,
                    keyword_item,
                    counter
                )
                ON CONFLICT ("campaignId", keyword) DO NOTHING;
                counter := counter + 1;
            END IF;
        END LOOP;
    END LOOP;
END;
$$;


--
-- Name: migrate_campaign_platforms(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.migrate_campaign_platforms() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    campaign_record RECORD;
    platform_item TEXT;
    platform_array TEXT[];
BEGIN
    FOR campaign_record IN 
        SELECT id, platform, platforms FROM campaigns 
        WHERE platform IS NOT NULL
    LOOP
        -- 기본 플랫폼 추가
        INSERT INTO campaign_platforms (id, "campaignId", platform, "isPrimary")
        VALUES (
            generate_random_uuid(),
            campaign_record.id,
            campaign_record.platform,
            true
        )
        ON CONFLICT ("campaignId", platform) DO NOTHING;
        
        -- platforms JSON이 있는 경우 추가 플랫폼들 처리
        IF campaign_record.platforms IS NOT NULL AND campaign_record.platforms != 'null' THEN
            platform_array := ARRAY(SELECT jsonb_array_elements_text(campaign_record.platforms::jsonb));
            
            FOREACH platform_item IN ARRAY platform_array
            LOOP
                IF platform_item != campaign_record.platform THEN
                    INSERT INTO campaign_platforms (id, "campaignId", platform, "isPrimary")
                    VALUES (
                        generate_random_uuid(),
                        campaign_record.id,
                        platform_item,
                        false
                    )
                    ON CONFLICT ("campaignId", platform) DO NOTHING;
                END IF;
            END LOOP;
        END IF;
    END LOOP;
END;
$$;


--
-- Name: apply_rls(jsonb, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024)) RETURNS SETOF realtime.wal_rls
    LANGUAGE plpgsql
    AS $$
declare
-- Regclass of the table e.g. public.notes
entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

-- I, U, D, T: insert, update ...
action realtime.action = (
    case wal ->> 'action'
        when 'I' then 'INSERT'
        when 'U' then 'UPDATE'
        when 'D' then 'DELETE'
        else 'ERROR'
    end
);

-- Is row level security enabled for the table
is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

subscriptions realtime.subscription[] = array_agg(subs)
    from
        realtime.subscription subs
    where
        subs.entity = entity_;

-- Subscription vars
roles regrole[] = array_agg(distinct us.claims_role::text)
    from
        unnest(subscriptions) us;

working_role regrole;
claimed_role regrole;
claims jsonb;

subscription_id uuid;
subscription_has_access bool;
visible_to_subscription_ids uuid[] = '{}';

-- structured info for wal's columns
columns realtime.wal_column[];
-- previous identity values for update/delete
old_columns realtime.wal_column[];

error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

-- Primary jsonb output for record
output jsonb;

begin
perform set_config('role', null, true);

columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'columns') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

old_columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'identity') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

for working_role in select * from unnest(roles) loop

    -- Update `is_selectable` for columns and old_columns
    columns =
        array_agg(
            (
                c.name,
                c.type_name,
                c.type_oid,
                c.value,
                c.is_pkey,
                pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
            )::realtime.wal_column
        )
        from
            unnest(columns) c;

    old_columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(old_columns) c;

    if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            -- subscriptions is already filtered by entity
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 400: Bad Request, no primary key']
        )::realtime.wal_rls;

    -- The claims role does not have SELECT permission to the primary key of entity
    elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 401: Unauthorized']
        )::realtime.wal_rls;

    else
        output = jsonb_build_object(
            'schema', wal ->> 'schema',
            'table', wal ->> 'table',
            'type', action,
            'commit_timestamp', to_char(
                ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            ),
            'columns', (
                select
                    jsonb_agg(
                        jsonb_build_object(
                            'name', pa.attname,
                            'type', pt.typname
                        )
                        order by pa.attnum asc
                    )
                from
                    pg_attribute pa
                    join pg_type pt
                        on pa.atttypid = pt.oid
                where
                    attrelid = entity_
                    and attnum > 0
                    and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
            )
        )
        -- Add "record" key for insert and update
        || case
            when action in ('INSERT', 'UPDATE') then
                jsonb_build_object(
                    'record',
                    (
                        select
                            jsonb_object_agg(
                                -- if unchanged toast, get column name and value from old record
                                coalesce((c).name, (oc).name),
                                case
                                    when (c).name is null then (oc).value
                                    else (c).value
                                end
                            )
                        from
                            unnest(columns) c
                            full outer join unnest(old_columns) oc
                                on (c).name = (oc).name
                        where
                            coalesce((c).is_selectable, (oc).is_selectable)
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                    )
                )
            else '{}'::jsonb
        end
        -- Add "old_record" key for update and delete
        || case
            when action = 'UPDATE' then
                jsonb_build_object(
                        'old_record',
                        (
                            select jsonb_object_agg((c).name, (c).value)
                            from unnest(old_columns) c
                            where
                                (c).is_selectable
                                and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                        )
                    )
            when action = 'DELETE' then
                jsonb_build_object(
                    'old_record',
                    (
                        select jsonb_object_agg((c).name, (c).value)
                        from unnest(old_columns) c
                        where
                            (c).is_selectable
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                    )
                )
            else '{}'::jsonb
        end;

        -- Create the prepared statement
        if is_rls_enabled and action <> 'DELETE' then
            if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                deallocate walrus_rls_stmt;
            end if;
            execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
        end if;

        visible_to_subscription_ids = '{}';

        for subscription_id, claims in (
                select
                    subs.subscription_id,
                    subs.claims
                from
                    unnest(subscriptions) subs
                where
                    subs.entity = entity_
                    and subs.claims_role = working_role
                    and (
                        realtime.is_visible_through_filters(columns, subs.filters)
                        or (
                          action = 'DELETE'
                          and realtime.is_visible_through_filters(old_columns, subs.filters)
                        )
                    )
        ) loop

            if not is_rls_enabled or action = 'DELETE' then
                visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
            else
                -- Check if RLS allows the role to see the record
                perform
                    -- Trim leading and trailing quotes from working_role because set_config
                    -- doesn't recognize the role as valid if they are included
                    set_config('role', trim(both '"' from working_role::text), true),
                    set_config('request.jwt.claims', claims::text, true);

                execute 'execute walrus_rls_stmt' into subscription_has_access;

                if subscription_has_access then
                    visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
                end if;
            end if;
        end loop;

        perform set_config('role', null, true);

        return next (
            output,
            is_rls_enabled,
            visible_to_subscription_ids,
            case
                when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                else '{}'
            end
        )::realtime.wal_rls;

    end if;
end loop;

perform set_config('role', null, true);
end;
$$;


--
-- Name: broadcast_changes(text, text, text, text, text, record, record, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$$;


--
-- Name: build_prepared_statement_sql(text, regclass, realtime.wal_column[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) RETURNS text
    LANGUAGE sql
    AS $$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $$;


--
-- Name: cast(text, regtype); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime."cast"(val text, type_ regtype) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
    declare
      res jsonb;
    begin
      execute format('select to_jsonb(%L::'|| type_::text || ')', val)  into res;
      return res;
    end
    $$;


--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
      /*
      Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
      */
      declare
          op_symbol text = (
              case
                  when op = 'eq' then '='
                  when op = 'neq' then '!='
                  when op = 'lt' then '<'
                  when op = 'lte' then '<='
                  when op = 'gt' then '>'
                  when op = 'gte' then '>='
                  when op = 'in' then '= any'
                  else 'UNKNOWN OP'
              end
          );
          res boolean;
      begin
          execute format(
              'select %L::'|| type_::text || ' ' || op_symbol
              || ' ( %L::'
              || (
                  case
                      when op = 'in' then type_::text || '[]'
                      else type_::text end
              )
              || ')', val_1, val_2) into res;
          return res;
      end;
      $$;


--
-- Name: is_visible_through_filters(realtime.wal_column[], realtime.user_defined_filter[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $_$
    /*
    Should the record be visible (true) or filtered out (false) after *filters* are applied
    */
        select
            -- Default to allowed when no filters present
            $2 is null -- no filters. this should not happen because subscriptions has a default
            or array_length($2, 1) is null -- array length of an empty array is null
            or bool_and(
                coalesce(
                    realtime.check_equality_op(
                        op:=f.op,
                        type_:=coalesce(
                            col.type_oid::regtype, -- null when wal2json version <= 2.4
                            col.type_name::regtype
                        ),
                        -- cast jsonb to text
                        val_1:=col.value #>> '{}',
                        val_2:=f.value
                    ),
                    false -- if null, filter does not match
                )
            )
        from
            unnest(filters) f
            join unnest(columns) col
                on f.column_name = col.name;
    $_$;


--
-- Name: list_changes(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS SETOF realtime.wal_rls
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
      with pub as (
        select
          concat_ws(
            ',',
            case when bool_or(pubinsert) then 'insert' else null end,
            case when bool_or(pubupdate) then 'update' else null end,
            case when bool_or(pubdelete) then 'delete' else null end
          ) as w2j_actions,
          coalesce(
            string_agg(
              realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
              ','
            ) filter (where ppt.tablename is not null and ppt.tablename not like '% %'),
            ''
          ) w2j_add_tables
        from
          pg_publication pp
          left join pg_publication_tables ppt
            on pp.pubname = ppt.pubname
        where
          pp.pubname = publication
        group by
          pp.pubname
        limit 1
      ),
      w2j as (
        select
          x.*, pub.w2j_add_tables
        from
          pub,
          pg_logical_slot_get_changes(
            slot_name, null, max_changes,
            'include-pk', 'true',
            'include-transaction', 'false',
            'include-timestamp', 'true',
            'include-type-oids', 'true',
            'format-version', '2',
            'actions', pub.w2j_actions,
            'add-tables', pub.w2j_add_tables
          ) x
      )
      select
        xyz.wal,
        xyz.is_rls_enabled,
        xyz.subscription_ids,
        xyz.errors
      from
        w2j,
        realtime.apply_rls(
          wal := w2j.data::jsonb,
          max_record_bytes := max_record_bytes
        ) xyz(wal, is_rls_enabled, subscription_ids, errors)
      where
        w2j.w2j_add_tables <> ''
        and xyz.subscription_ids[1] is not null
    $$;


--
-- Name: quote_wal2json(regclass); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.quote_wal2json(entity regclass) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
      select
        (
          select string_agg('' || ch,'')
          from unnest(string_to_array(nsp.nspname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
        )
        || '.'
        || (
          select string_agg('' || ch,'')
          from unnest(string_to_array(pc.relname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
          )
      from
        pg_class pc
        join pg_namespace nsp
          on pc.relnamespace = nsp.oid
      where
        pc.oid = entity
    $$;


--
-- Name: send(jsonb, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  BEGIN
    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    -- Attempt to insert the message
    INSERT INTO realtime.messages (payload, event, topic, private, extension)
    VALUES (payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      -- Capture and notify the error
      RAISE WARNING 'ErrorSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


--
-- Name: subscription_check_filters(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.subscription_check_filters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    /*
    Validates that the user defined filters for a subscription:
    - refer to valid columns that the claimed role may access
    - values are coercable to the correct column type
    */
    declare
        col_names text[] = coalesce(
                array_agg(c.column_name order by c.ordinal_position),
                '{}'::text[]
            )
            from
                information_schema.columns c
            where
                format('%I.%I', c.table_schema, c.table_name)::regclass = new.entity
                and pg_catalog.has_column_privilege(
                    (new.claims ->> 'role'),
                    format('%I.%I', c.table_schema, c.table_name)::regclass,
                    c.column_name,
                    'SELECT'
                );
        filter realtime.user_defined_filter;
        col_type regtype;

        in_val jsonb;
    begin
        for filter in select * from unnest(new.filters) loop
            -- Filtered column is valid
            if not filter.column_name = any(col_names) then
                raise exception 'invalid column for filter %', filter.column_name;
            end if;

            -- Type is sanitized and safe for string interpolation
            col_type = (
                select atttypid::regtype
                from pg_catalog.pg_attribute
                where attrelid = new.entity
                      and attname = filter.column_name
            );
            if col_type is null then
                raise exception 'failed to lookup type for column %', filter.column_name;
            end if;

            -- Set maximum number of entries for in filter
            if filter.op = 'in'::realtime.equality_op then
                in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
                if coalesce(jsonb_array_length(in_val), 0) > 100 then
                    raise exception 'too many values for `in` filter. Maximum 100';
                end if;
            else
                -- raises an exception if value is not coercable to type
                perform realtime.cast(filter.value, col_type);
            end if;

        end loop;

        -- Apply consistent order to filters so the unique constraint on
        -- (subscription_id, entity, filters) can't be tricked by a different filter order
        new.filters = coalesce(
            array_agg(f order by f.column_name, f.op, f.value),
            '{}'
        ) from unnest(new.filters) f;

        return new;
    end;
    $$;


--
-- Name: to_regrole(text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.to_regrole(role_name text) RETURNS regrole
    LANGUAGE sql IMMUTABLE
    AS $$ select role_name::regrole $$;


--
-- Name: topic(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.topic() RETURNS text
    LANGUAGE sql STABLE
    AS $$
select nullif(current_setting('realtime.topic', true), '')::text;
$$;


--
-- Name: add_prefixes(text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.add_prefixes(_bucket_id text, _name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    prefixes text[];
BEGIN
    prefixes := "storage"."get_prefixes"("_name");

    IF array_length(prefixes, 1) > 0 THEN
        INSERT INTO storage.prefixes (name, bucket_id)
        SELECT UNNEST(prefixes) as name, "_bucket_id" ON CONFLICT DO NOTHING;
    END IF;
END;
$$;


--
-- Name: can_insert_object(text, text, uuid, jsonb); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


--
-- Name: delete_prefix(text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.delete_prefix(_bucket_id text, _name text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- Check if we can delete the prefix
    IF EXISTS(
        SELECT FROM "storage"."prefixes"
        WHERE "prefixes"."bucket_id" = "_bucket_id"
          AND level = "storage"."get_level"("_name") + 1
          AND "prefixes"."name" COLLATE "C" LIKE "_name" || '/%'
        LIMIT 1
    )
    OR EXISTS(
        SELECT FROM "storage"."objects"
        WHERE "objects"."bucket_id" = "_bucket_id"
          AND "storage"."get_level"("objects"."name") = "storage"."get_level"("_name") + 1
          AND "objects"."name" COLLATE "C" LIKE "_name" || '/%'
        LIMIT 1
    ) THEN
    -- There are sub-objects, skip deletion
    RETURN false;
    ELSE
        DELETE FROM "storage"."prefixes"
        WHERE "prefixes"."bucket_id" = "_bucket_id"
          AND level = "storage"."get_level"("_name")
          AND "prefixes"."name" = "_name";
        RETURN true;
    END IF;
END;
$$;


--
-- Name: delete_prefix_hierarchy_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.delete_prefix_hierarchy_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    prefix text;
BEGIN
    prefix := "storage"."get_prefix"(OLD."name");

    IF coalesce(prefix, '') != '' THEN
        PERFORM "storage"."delete_prefix"(OLD."bucket_id", prefix);
    END IF;

    RETURN OLD;
END;
$$;


--
-- Name: enforce_bucket_name_length(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.enforce_bucket_name_length() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


--
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    SELECT _parts[array_length(_parts,1)] INTO _filename;
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;


--
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$$;


--
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$$;


--
-- Name: get_level(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_level(name text) RETURNS integer
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
SELECT array_length(string_to_array("name", '/'), 1);
$$;


--
-- Name: get_prefix(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_prefix(name text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $_$
SELECT
    CASE WHEN strpos("name", '/') > 0 THEN
             regexp_replace("name", '[\/]{1}[^\/]+\/?$', '')
         ELSE
             ''
        END;
$_$;


--
-- Name: get_prefixes(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_prefixes(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $$
DECLARE
    parts text[];
    prefixes text[];
    prefix text;
BEGIN
    -- Split the name into parts by '/'
    parts := string_to_array("name", '/');
    prefixes := '{}';

    -- Construct the prefixes, stopping one level below the last part
    FOR i IN 1..array_length(parts, 1) - 1 LOOP
            prefix := array_to_string(parts[1:i], '/');
            prefixes := array_append(prefixes, prefix);
    END LOOP;

    RETURN prefixes;
END;
$$;


--
-- Name: get_size_by_bucket(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_size_by_bucket() RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::bigint) as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


--
-- Name: list_multipart_uploads_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text) RETURNS TABLE(key text, id text, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


--
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_objects_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text) RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(name COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(name from length($1) + 1)) > 0 THEN
                        substring(name from 1 for length($1) + position($2 IN substring(name from length($1) + 1)))
                    ELSE
                        name
                END AS name, id, metadata, updated_at
            FROM
                storage.objects
            WHERE
                bucket_id = $5 AND
                name ILIKE $1 || ''%'' AND
                CASE
                    WHEN $6 != '''' THEN
                    name COLLATE "C" > $6
                ELSE true END
                AND CASE
                    WHEN $4 != '''' THEN
                        CASE
                            WHEN position($2 IN substring(name from length($1) + 1)) > 0 THEN
                                substring(name from 1 for length($1) + position($2 IN substring(name from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                name COLLATE "C" > $4
                            END
                    ELSE
                        true
                END
            ORDER BY
                name COLLATE "C" ASC) as e order by name COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_token, bucket_id, start_after;
END;
$_$;


--
-- Name: objects_insert_prefix_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.objects_insert_prefix_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM "storage"."add_prefixes"(NEW."bucket_id", NEW."name");
    NEW.level := "storage"."get_level"(NEW."name");

    RETURN NEW;
END;
$$;


--
-- Name: objects_update_prefix_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.objects_update_prefix_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    old_prefixes TEXT[];
BEGIN
    -- Ensure this is an update operation and the name has changed
    IF TG_OP = 'UPDATE' AND (NEW."name" <> OLD."name" OR NEW."bucket_id" <> OLD."bucket_id") THEN
        -- Retrieve old prefixes
        old_prefixes := "storage"."get_prefixes"(OLD."name");

        -- Remove old prefixes that are only used by this object
        WITH all_prefixes as (
            SELECT unnest(old_prefixes) as prefix
        ),
        can_delete_prefixes as (
             SELECT prefix
             FROM all_prefixes
             WHERE NOT EXISTS (
                 SELECT 1 FROM "storage"."objects"
                 WHERE "bucket_id" = OLD."bucket_id"
                   AND "name" <> OLD."name"
                   AND "name" LIKE (prefix || '%')
             )
         )
        DELETE FROM "storage"."prefixes" WHERE name IN (SELECT prefix FROM can_delete_prefixes);

        -- Add new prefixes
        PERFORM "storage"."add_prefixes"(NEW."bucket_id", NEW."name");
    END IF;
    -- Set the new level
    NEW."level" := "storage"."get_level"(NEW."name");

    RETURN NEW;
END;
$$;


--
-- Name: operation(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.operation() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


--
-- Name: prefixes_insert_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.prefixes_insert_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM "storage"."add_prefixes"(NEW."bucket_id", NEW."name");
    RETURN NEW;
END;
$$;


--
-- Name: search(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql
    AS $$
declare
    can_bypass_rls BOOLEAN;
begin
    SELECT rolbypassrls
    INTO can_bypass_rls
    FROM pg_roles
    WHERE rolname = coalesce(nullif(current_setting('role', true), 'none'), current_user);

    IF can_bypass_rls THEN
        RETURN QUERY SELECT * FROM storage.search_v1_optimised(prefix, bucketname, limits, levels, offsets, search, sortcolumn, sortorder);
    ELSE
        RETURN QUERY SELECT * FROM storage.search_legacy_v1(prefix, bucketname, limits, levels, offsets, search, sortcolumn, sortorder);
    END IF;
end;
$$;


--
-- Name: search_legacy_v1(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_legacy_v1(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
declare
    v_order_by text;
    v_sort_order text;
begin
    case
        when sortcolumn = 'name' then
            v_order_by = 'name';
        when sortcolumn = 'updated_at' then
            v_order_by = 'updated_at';
        when sortcolumn = 'created_at' then
            v_order_by = 'created_at';
        when sortcolumn = 'last_accessed_at' then
            v_order_by = 'last_accessed_at';
        else
            v_order_by = 'name';
        end case;

    case
        when sortorder = 'asc' then
            v_sort_order = 'asc';
        when sortorder = 'desc' then
            v_sort_order = 'desc';
        else
            v_sort_order = 'asc';
        end case;

    v_order_by = v_order_by || ' ' || v_sort_order;

    return query execute
        'with folders as (
           select path_tokens[$1] as folder
           from storage.objects
             where objects.name ilike $2 || $3 || ''%''
               and bucket_id = $4
               and array_length(objects.path_tokens, 1) <> $1
           group by folder
           order by folder ' || v_sort_order || '
     )
     (select folder as "name",
            null as id,
            null as updated_at,
            null as created_at,
            null as last_accessed_at,
            null as metadata from folders)
     union all
     (select path_tokens[$1] as "name",
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
     from storage.objects
     where objects.name ilike $2 || $3 || ''%''
       and bucket_id = $4
       and array_length(objects.path_tokens, 1) = $1
     order by ' || v_order_by || ')
     limit $5
     offset $6' using levels, prefix, search, bucketname, limits, offsets;
end;
$_$;


--
-- Name: search_v1_optimised(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v1_optimised(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
declare
    v_order_by text;
    v_sort_order text;
begin
    case
        when sortcolumn = 'name' then
            v_order_by = 'name';
        when sortcolumn = 'updated_at' then
            v_order_by = 'updated_at';
        when sortcolumn = 'created_at' then
            v_order_by = 'created_at';
        when sortcolumn = 'last_accessed_at' then
            v_order_by = 'last_accessed_at';
        else
            v_order_by = 'name';
        end case;

    case
        when sortorder = 'asc' then
            v_sort_order = 'asc';
        when sortorder = 'desc' then
            v_sort_order = 'desc';
        else
            v_sort_order = 'asc';
        end case;

    v_order_by = v_order_by || ' ' || v_sort_order;

    return query execute
        'with folders as (
           select (string_to_array(name, ''/''))[level] as name
           from storage.prefixes
             where lower(prefixes.name) like lower($2 || $3) || ''%''
               and bucket_id = $4
               and level = $1
           order by name ' || v_sort_order || '
     )
     (select name,
            null as id,
            null as updated_at,
            null as created_at,
            null as last_accessed_at,
            null as metadata from folders)
     union all
     (select path_tokens[level] as "name",
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
     from storage.objects
     where lower(objects.name) like lower($2 || $3) || ''%''
       and bucket_id = $4
       and level = $1
     order by ' || v_order_by || ')
     limit $5
     offset $6' using levels, prefix, search, bucketname, limits, offsets;
end;
$_$;


--
-- Name: search_v2(text, text, integer, integer, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
BEGIN
    RETURN query EXECUTE
        $sql$
        SELECT * FROM (
            (
                SELECT
                    split_part(name, '/', $4) AS key,
                    name || '/' AS name,
                    NULL::uuid AS id,
                    NULL::timestamptz AS updated_at,
                    NULL::timestamptz AS created_at,
                    NULL::jsonb AS metadata
                FROM storage.prefixes
                WHERE name COLLATE "C" LIKE $1 || '%'
                AND bucket_id = $2
                AND level = $4
                AND name COLLATE "C" > $5
                ORDER BY prefixes.name COLLATE "C" LIMIT $3
            )
            UNION ALL
            (SELECT split_part(name, '/', $4) AS key,
                name,
                id,
                updated_at,
                created_at,
                metadata
            FROM storage.objects
            WHERE name COLLATE "C" LIKE $1 || '%'
                AND bucket_id = $2
                AND level = $4
                AND name COLLATE "C" > $5
            ORDER BY name COLLATE "C" LIMIT $3)
        ) obj
        ORDER BY name COLLATE "C" LIMIT $3;
        $sql$
        USING prefix, bucket_name, limits, levels, start_after;
END;
$_$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


--
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text NOT NULL,
    code_challenge_method auth.code_challenge_method NOT NULL,
    code_challenge text NOT NULL,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone
);


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


--
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid
);


--
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


--
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text
);


--
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


--
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


--
-- Name: business_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_profiles (
    id text NOT NULL,
    "userId" text NOT NULL,
    "companyName" text NOT NULL,
    "businessNumber" text NOT NULL,
    "representativeName" text NOT NULL,
    "businessAddress" text NOT NULL,
    "businessCategory" text NOT NULL,
    "businessRegistration" text,
    "businessFileName" text,
    "businessFileSize" integer,
    "isVerified" boolean DEFAULT false NOT NULL,
    "verificationNotes" text,
    "verifiedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: campaign_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_applications (
    id text NOT NULL,
    "campaignId" text NOT NULL,
    "influencerId" text NOT NULL,
    message text NOT NULL,
    "proposedPrice" double precision,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "reviewedAt" timestamp(3) without time zone,
    "rejectionReason" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone
);


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id text NOT NULL,
    "businessId" text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    platform text DEFAULT 'INSTAGRAM'::text NOT NULL,
    budget double precision,
    "targetFollowers" integer,
    "startDate" timestamp(3) without time zone NOT NULL,
    "endDate" timestamp(3) without time zone NOT NULL,
    requirements text,
    "imageUrl" text,
    "imageId" text,
    "headerImageUrl" text,
    "thumbnailImageUrl" text,
    "announcementDate" timestamp(3) without time zone,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    "isPaid" boolean DEFAULT false NOT NULL,
    "reviewFeedback" text,
    "reviewedAt" timestamp(3) without time zone,
    "maxApplicants" integer DEFAULT 100 NOT NULL,
    "rewardAmount" double precision DEFAULT 0 NOT NULL,
    "detailImages" jsonb,
    "productImages" jsonb,
    questions jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    deliverables text,
    "detailedRequirements" text,
    "platformFeeRate" double precision DEFAULT 0.2 NOT NULL,
    location text DEFAULT '전국'::text NOT NULL,
    "productIntro" text,
    "viewCount" integer DEFAULT 0 NOT NULL,
    translations jsonb,
    "additionalNotes" text,
    "applicationEndDate" timestamp(3) without time zone,
    "applicationStartDate" timestamp(3) without time zone,
    "campaignMission" text,
    "contentEndDate" timestamp(3) without time zone,
    "contentStartDate" timestamp(3) without time zone,
    keywords text,
    "provisionDetails" text,
    "resultAnnouncementDate" timestamp(3) without time zone,
    category text,
    "mainCategory" text,
    "deletedAt" timestamp(3) without time zone,
    "budgetType" text DEFAULT 'FREE'::text,
    "isPublished" boolean DEFAULT false NOT NULL,
    "youtubeUrl" text,
    hashtags jsonb,
    platforms jsonb,
    "campaignType" text
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id text NOT NULL,
    "orderId" text NOT NULL,
    "campaignId" text,
    "userId" text NOT NULL,
    amount double precision NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "paymentMethod" text NOT NULL,
    "paymentKey" text,
    "approvedAt" timestamp(3) without time zone,
    "failedAt" timestamp(3) without time zone,
    "failReason" text,
    receipt text,
    "refundedAmount" double precision DEFAULT 0 NOT NULL,
    metadata text DEFAULT '{}'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id text NOT NULL,
    "userId" text NOT NULL,
    bio text,
    "profileImage" text,
    "profileImageId" text,
    phone text,
    "birthYear" integer,
    gender text,
    instagram text,
    "instagramFollowers" integer,
    youtube text,
    "youtubeSubscribers" integer,
    tiktok text,
    "tiktokFollowers" integer,
    facebook text,
    "facebookFollowers" integer,
    twitter text,
    "twitterFollowers" integer,
    "averageEngagementRate" double precision,
    categories text,
    "isVerified" boolean DEFAULT false NOT NULL,
    "verificationNotes" text,
    "verifiedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "followerCount" integer DEFAULT 0 NOT NULL,
    "naverBlog" text,
    address text,
    "bankName" text,
    "bankAccountNumber" text,
    "bankAccountHolder" text,
    "naverBlogFollowers" integer,
    "snsLastUpdated" timestamp(3) without time zone,
    "naverBlogTodayVisitors" integer,
    "birthDate" timestamp(3) without time zone,
    nationality text,
    "realName" text,
    "addressData" jsonb,
    "profileCompleted" boolean DEFAULT false NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    "statusReason" text,
    "statusUpdatedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "lastLogin" timestamp(3) without time zone,
    verified boolean DEFAULT false NOT NULL,
    "deletedAt" timestamp(3) without time zone
);


--
-- Name: admin_dashboard_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.admin_dashboard_stats AS
 SELECT ( SELECT count(*) AS count
           FROM public.users
          WHERE (users."deletedAt" IS NULL)) AS total_users,
    ( SELECT count(*) AS count
           FROM public.users
          WHERE ((users."deletedAt" IS NULL) AND (users.type = 'BUSINESS'::text))) AS total_businesses,
    ( SELECT count(*) AS count
           FROM public.users
          WHERE ((users."deletedAt" IS NULL) AND (users.type = 'INFLUENCER'::text))) AS total_influencers,
    ( SELECT count(*) AS count
           FROM public.users
          WHERE ((users."deletedAt" IS NULL) AND (users."lastLogin" >= (now() - '7 days'::interval)))) AS active_users,
    ( SELECT count(*) AS count
           FROM public.users
          WHERE ((users."deletedAt" IS NULL) AND (users."createdAt" >= CURRENT_DATE))) AS new_users_today,
    ( SELECT count(*) AS count
           FROM public.campaigns
          WHERE (campaigns."deletedAt" IS NULL)) AS total_campaigns,
    ( SELECT count(*) AS count
           FROM public.campaigns
          WHERE ((campaigns."deletedAt" IS NULL) AND (campaigns.status = 'ACTIVE'::text))) AS active_campaigns,
    ( SELECT count(*) AS count
           FROM public.campaigns
          WHERE ((campaigns."deletedAt" IS NULL) AND (campaigns.status = 'DRAFT'::text))) AS draft_campaigns,
    ( SELECT count(*) AS count
           FROM public.campaigns
          WHERE ((campaigns."deletedAt" IS NULL) AND (campaigns.status = 'COMPLETED'::text))) AS completed_campaigns,
    ( SELECT count(*) AS count
           FROM public.campaigns
          WHERE ((campaigns."deletedAt" IS NULL) AND (campaigns."createdAt" >= CURRENT_DATE))) AS new_campaigns_today,
    ( SELECT count(*) AS count
           FROM public.campaign_applications
          WHERE (campaign_applications."deletedAt" IS NULL)) AS total_applications,
    ( SELECT count(*) AS count
           FROM public.campaign_applications
          WHERE ((campaign_applications."deletedAt" IS NULL) AND (campaign_applications.status = 'PENDING'::text))) AS pending_applications,
    ( SELECT count(*) AS count
           FROM public.campaign_applications
          WHERE ((campaign_applications."deletedAt" IS NULL) AND (campaign_applications.status = 'APPROVED'::text))) AS approved_applications,
    ( SELECT count(*) AS count
           FROM public.campaign_applications
          WHERE ((campaign_applications."deletedAt" IS NULL) AND (campaign_applications."createdAt" >= CURRENT_DATE))) AS new_applications_today,
    ( SELECT COALESCE(sum(payments.amount), (0)::double precision) AS "coalesce"
           FROM public.payments
          WHERE (payments.status = 'COMPLETED'::text)) AS total_revenue,
    ( SELECT COALESCE(sum(payments.amount), (0)::double precision) AS "coalesce"
           FROM public.payments
          WHERE ((payments.status = 'COMPLETED'::text) AND (payments."createdAt" >= CURRENT_DATE))) AS revenue_today,
    ( SELECT count(*) AS count
           FROM public.payments
          WHERE (payments.status = 'PENDING'::text)) AS pending_payments,
    ( SELECT count(*) AS count
           FROM public.business_profiles
          WHERE (business_profiles."isVerified" = false)) AS pending_business_approvals,
    ( SELECT count(*) AS count
           FROM public.profiles
          WHERE (profiles."isVerified" = false)) AS pending_influencer_approvals;


--
-- Name: api_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_config (
    id text NOT NULL,
    service text NOT NULL,
    "apiKey" text,
    "apiSecret" text,
    endpoint text,
    region text,
    bucket text,
    "additionalConfig" jsonb,
    "isEnabled" boolean DEFAULT false NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: application_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.application_templates (
    id text NOT NULL,
    name text NOT NULL,
    content text NOT NULL,
    "userId" text,
    "isPublic" boolean DEFAULT true NOT NULL,
    category text,
    "useCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: campaign_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_categories (
    id text NOT NULL,
    "campaignId" text NOT NULL,
    "categoryId" text NOT NULL,
    "isPrimary" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id text NOT NULL,
    slug text NOT NULL,
    "parentId" text,
    level integer DEFAULT 1 NOT NULL,
    name text NOT NULL,
    description text,
    icon text,
    color text,
    "imageUrl" text,
    "order" integer DEFAULT 0,
    "isActive" boolean DEFAULT true NOT NULL,
    "showInMenu" boolean DEFAULT false NOT NULL,
    "menuOrder" integer,
    "seoTitle" text,
    "seoDescription" text,
    "customPageContent" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: campaign_complete; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.campaign_complete AS
 SELECT c.id,
    c."businessId",
    c.title,
    c.description,
    c.platform,
    c.budget,
    c."targetFollowers",
    c."startDate",
    c."endDate",
    c.requirements,
    c.hashtags,
    c."imageUrl",
    c."imageId",
    c."headerImageUrl",
    c."thumbnailImageUrl",
    c."productImages",
    c.status,
    c."isPaid",
    c."maxApplicants",
    c."rewardAmount",
    c.location,
    c."viewCount",
    c."createdAt",
    c."updatedAt",
    c."budgetType",
    c."isPublished",
    c."campaignType",
    u.name AS business_name,
    u.email AS business_email,
    bp."companyName" AS company_name,
    bp."businessCategory" AS business_category,
    bp."isVerified" AS business_verified,
    cat_info.primary_category_name,
    cat_info.primary_category_slug,
    cat_info.all_categories,
    COALESCE(stats.application_count, (0)::bigint) AS application_count,
    COALESCE(stats.approved_count, (0)::bigint) AS approved_count,
        CASE
            WHEN (c."endDate" < now()) THEN 'EXPIRED'::text
            WHEN (c."startDate" > now()) THEN 'UPCOMING'::text
            ELSE c.status
        END AS computed_status,
    (EXTRACT(epoch FROM ((c."endDate")::timestamp with time zone - now())) / (86400)::numeric) AS days_remaining,
        CASE
            WHEN ((c.budget IS NOT NULL) AND (c.budget > (0)::double precision)) THEN c.budget
            WHEN ((c."rewardAmount" IS NOT NULL) AND (c."rewardAmount" > (0)::double precision)) THEN c."rewardAmount"
            ELSE (0)::double precision
        END AS effective_budget
   FROM ((((public.campaigns c
     JOIN public.users u ON ((c."businessId" = u.id)))
     LEFT JOIN public.business_profiles bp ON ((u.id = bp."userId")))
     LEFT JOIN ( SELECT cc."campaignId",
            max(
                CASE
                    WHEN (cc."isPrimary" = true) THEN cat.name
                    ELSE NULL::text
                END) AS primary_category_name,
            max(
                CASE
                    WHEN (cc."isPrimary" = true) THEN cat.slug
                    ELSE NULL::text
                END) AS primary_category_slug,
            json_agg(json_build_object('id', cat.id, 'name', cat.name, 'slug', cat.slug, 'isPrimary', cc."isPrimary")) AS all_categories
           FROM (public.campaign_categories cc
             JOIN public.categories cat ON ((cc."categoryId" = cat.id)))
          WHERE (cat."isActive" = true)
          GROUP BY cc."campaignId") cat_info ON ((c.id = cat_info."campaignId")))
     LEFT JOIN ( SELECT ca."campaignId",
            count(*) AS application_count,
            count(
                CASE
                    WHEN (ca.status = 'APPROVED'::text) THEN 1
                    ELSE NULL::integer
                END) AS approved_count
           FROM public.campaign_applications ca
          WHERE (ca."deletedAt" IS NULL)
          GROUP BY ca."campaignId") stats ON ((c.id = stats."campaignId")))
  WHERE ((c."deletedAt" IS NULL) AND (u.type = 'BUSINESS'::text));


--
-- Name: campaign_hashtags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_hashtags (
    id text NOT NULL,
    "campaignId" text NOT NULL,
    hashtag text NOT NULL,
    "order" integer DEFAULT 0,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: campaign_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_images (
    id text NOT NULL,
    "campaignId" text NOT NULL,
    "imageUrl" text NOT NULL,
    "imageId" text,
    type text NOT NULL,
    "order" integer DEFAULT 0,
    alt text,
    caption text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: campaign_keywords; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_keywords (
    id text NOT NULL,
    "campaignId" text NOT NULL,
    keyword text NOT NULL,
    weight integer DEFAULT 1,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: campaign_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_likes (
    id text NOT NULL,
    "campaignId" text NOT NULL,
    "userId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: campaign_platforms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_platforms (
    id text NOT NULL,
    "campaignId" text NOT NULL,
    platform text NOT NULL,
    "isPrimary" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: campaign_normalized; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.campaign_normalized AS
 SELECT c.id,
    c."businessId",
    c.title,
    c.description,
    c.platform,
    c.budget,
    c."targetFollowers",
    c."startDate",
    c."endDate",
    c.requirements,
    c."imageUrl",
    c."imageId",
    c."headerImageUrl",
    c."thumbnailImageUrl",
    c."announcementDate",
    c.status,
    c."isPaid",
    c."reviewFeedback",
    c."reviewedAt",
    c."maxApplicants",
    c."rewardAmount",
    c."detailImages",
    c."productImages",
    c.questions,
    c."createdAt",
    c."updatedAt",
    c.deliverables,
    c."detailedRequirements",
    c."platformFeeRate",
    c.location,
    c."productIntro",
    c."viewCount",
    c.translations,
    c."additionalNotes",
    c."applicationEndDate",
    c."applicationStartDate",
    c."campaignMission",
    c."contentEndDate",
    c."contentStartDate",
    c.keywords,
    c."provisionDetails",
    c."resultAnnouncementDate",
    c.category,
    c."mainCategory",
    c."deletedAt",
    c."budgetType",
    c."isPublished",
    c."youtubeUrl",
    c.hashtags,
    c.platforms,
    c."campaignType",
    hashtag_agg.hashtags AS normalized_hashtags,
    platform_agg.platforms AS normalized_platforms,
    platform_agg.primary_platform,
    image_agg.images AS normalized_images,
    keyword_agg.keywords AS normalized_keywords
   FROM ((((public.campaigns c
     LEFT JOIN ( SELECT campaign_hashtags."campaignId",
            json_agg(campaign_hashtags.hashtag ORDER BY campaign_hashtags."order") AS hashtags
           FROM public.campaign_hashtags
          GROUP BY campaign_hashtags."campaignId") hashtag_agg ON ((c.id = hashtag_agg."campaignId")))
     LEFT JOIN ( SELECT campaign_platforms."campaignId",
            json_agg(campaign_platforms.platform) AS platforms,
            max(
                CASE
                    WHEN (campaign_platforms."isPrimary" = true) THEN campaign_platforms.platform
                    ELSE NULL::text
                END) AS primary_platform
           FROM public.campaign_platforms
          GROUP BY campaign_platforms."campaignId") platform_agg ON ((c.id = platform_agg."campaignId")))
     LEFT JOIN ( SELECT campaign_images."campaignId",
            json_agg(json_build_object('url', campaign_images."imageUrl", 'type', campaign_images.type, 'order', campaign_images."order", 'alt', campaign_images.alt, 'caption', campaign_images.caption) ORDER BY campaign_images."order") AS images
           FROM public.campaign_images
          GROUP BY campaign_images."campaignId") image_agg ON ((c.id = image_agg."campaignId")))
     LEFT JOIN ( SELECT campaign_keywords."campaignId",
            json_agg(campaign_keywords.keyword ORDER BY campaign_keywords.weight DESC) AS keywords
           FROM public.campaign_keywords
          GROUP BY campaign_keywords."campaignId") keyword_agg ON ((c.id = keyword_agg."campaignId")))
  WHERE (c."deletedAt" IS NULL);


--
-- Name: campaign_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_questions (
    id text NOT NULL,
    "campaignId" text NOT NULL,
    question text NOT NULL,
    type text DEFAULT 'TEXT'::text NOT NULL,
    required boolean DEFAULT false NOT NULL,
    options jsonb,
    "order" integer DEFAULT 0,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: campaign_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_templates (
    id text NOT NULL,
    "businessId" text NOT NULL,
    name text NOT NULL,
    description text,
    data jsonb NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: campaign_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_translations (
    id text NOT NULL,
    "campaignId" text NOT NULL,
    language text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    requirements text,
    hashtags text[],
    "isAutoTranslated" boolean DEFAULT true NOT NULL,
    "lastEditedBy" text,
    "editedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: campaign_with_business; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.campaign_with_business AS
 SELECT c.id,
    c."businessId",
    c.title,
    c.description,
    c.platform,
    c.budget,
    c."targetFollowers",
    c."startDate",
    c."endDate",
    c.requirements,
    c."imageUrl",
    c."imageId",
    c."headerImageUrl",
    c."thumbnailImageUrl",
    c."announcementDate",
    c.status,
    c."isPaid",
    c."reviewFeedback",
    c."reviewedAt",
    c."maxApplicants",
    c."rewardAmount",
    c."detailImages",
    c."productImages",
    c.questions,
    c."createdAt",
    c."updatedAt",
    c.deliverables,
    c."detailedRequirements",
    c."platformFeeRate",
    c.location,
    c."productIntro",
    c."viewCount",
    c.translations,
    c."additionalNotes",
    c."applicationEndDate",
    c."applicationStartDate",
    c."campaignMission",
    c."contentEndDate",
    c."contentStartDate",
    c.keywords,
    c."provisionDetails",
    c."resultAnnouncementDate",
    c.category,
    c."mainCategory",
    c."deletedAt",
    c."budgetType",
    c."isPublished",
    c."youtubeUrl",
    c.hashtags,
    c.platforms,
    c."campaignType",
    u.name AS business_name,
    u.email AS business_email,
    bp."companyName" AS company_name,
    bp."businessNumber" AS business_number,
    bp."representativeName" AS representative_name,
    bp."businessCategory" AS business_category,
    bp."businessAddress" AS business_address,
    bp."isVerified" AS business_verified
   FROM ((public.campaigns c
     JOIN public.users u ON ((c."businessId" = u.id)))
     LEFT JOIN public.business_profiles bp ON ((u.id = bp."userId")))
  WHERE ((u.type = 'BUSINESS'::text) AND (c."deletedAt" IS NULL));


--
-- Name: campaign_with_categories; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.campaign_with_categories AS
 SELECT c.id,
    c."businessId",
    c.title,
    c.description,
    c.platform,
    c.budget,
    c."targetFollowers",
    c."startDate",
    c."endDate",
    c.requirements,
    c."imageUrl",
    c."imageId",
    c."headerImageUrl",
    c."thumbnailImageUrl",
    c."announcementDate",
    c.status,
    c."isPaid",
    c."reviewFeedback",
    c."reviewedAt",
    c."maxApplicants",
    c."rewardAmount",
    c."detailImages",
    c."productImages",
    c.questions,
    c."createdAt",
    c."updatedAt",
    c.deliverables,
    c."detailedRequirements",
    c."platformFeeRate",
    c.location,
    c."productIntro",
    c."viewCount",
    c.translations,
    c."additionalNotes",
    c."applicationEndDate",
    c."applicationStartDate",
    c."campaignMission",
    c."contentEndDate",
    c."contentStartDate",
    c.keywords,
    c."provisionDetails",
    c."resultAnnouncementDate",
    c.category,
    c."mainCategory",
    c."deletedAt",
    c."budgetType",
    c."isPublished",
    c."youtubeUrl",
    c.hashtags,
    c.platforms,
    c."campaignType",
    cat_info.primary_category_id,
    cat_info.primary_category_name,
    cat_info.primary_category_slug,
    cat_info.all_categories,
    cat_info.category_count
   FROM (public.campaigns c
     LEFT JOIN ( SELECT cc."campaignId",
            max(
                CASE
                    WHEN (cc."isPrimary" = true) THEN cat.id
                    ELSE NULL::text
                END) AS primary_category_id,
            max(
                CASE
                    WHEN (cc."isPrimary" = true) THEN cat.name
                    ELSE NULL::text
                END) AS primary_category_name,
            max(
                CASE
                    WHEN (cc."isPrimary" = true) THEN cat.slug
                    ELSE NULL::text
                END) AS primary_category_slug,
            json_agg(json_build_object('id', cat.id, 'name', cat.name, 'slug', cat.slug, 'isPrimary', cc."isPrimary")) AS all_categories,
            count(*) AS category_count
           FROM (public.campaign_categories cc
             JOIN public.categories cat ON ((cc."categoryId" = cat.id)))
          WHERE (cat."isActive" = true)
          GROUP BY cc."campaignId") cat_info ON ((c.id = cat_info."campaignId")))
  WHERE (c."deletedAt" IS NULL);


--
-- Name: contents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contents (
    id text NOT NULL,
    "applicationId" text NOT NULL,
    "contentUrl" text NOT NULL,
    description text,
    platform text NOT NULL,
    status text DEFAULT 'PENDING_REVIEW'::text NOT NULL,
    feedback text,
    "reviewedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: campaign_with_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.campaign_with_stats AS
 SELECT c.id,
    c."businessId",
    c.title,
    c.description,
    c.platform,
    c.budget,
    c."targetFollowers",
    c."startDate",
    c."endDate",
    c.requirements,
    c."imageUrl",
    c."imageId",
    c."headerImageUrl",
    c."thumbnailImageUrl",
    c."announcementDate",
    c.status,
    c."isPaid",
    c."reviewFeedback",
    c."reviewedAt",
    c."maxApplicants",
    c."rewardAmount",
    c."detailImages",
    c."productImages",
    c.questions,
    c."createdAt",
    c."updatedAt",
    c.deliverables,
    c."detailedRequirements",
    c."platformFeeRate",
    c.location,
    c."productIntro",
    c."viewCount",
    c.translations,
    c."additionalNotes",
    c."applicationEndDate",
    c."applicationStartDate",
    c."campaignMission",
    c."contentEndDate",
    c."contentStartDate",
    c.keywords,
    c."provisionDetails",
    c."resultAnnouncementDate",
    c.category,
    c."mainCategory",
    c."deletedAt",
    c."budgetType",
    c."isPublished",
    c."youtubeUrl",
    c.hashtags,
    c.platforms,
    c."campaignType",
    COALESCE(app_stats.application_count, (0)::bigint) AS application_count,
    COALESCE(app_stats.approved_count, (0)::bigint) AS approved_count,
    COALESCE(content_stats.content_count, (0)::bigint) AS content_count,
    COALESCE(content_stats.approved_content_count, (0)::bigint) AS approved_content_count
   FROM ((public.campaigns c
     LEFT JOIN ( SELECT ca."campaignId",
            count(*) AS application_count,
            count(
                CASE
                    WHEN (ca.status = 'APPROVED'::text) THEN 1
                    ELSE NULL::integer
                END) AS approved_count
           FROM public.campaign_applications ca
          WHERE (ca."deletedAt" IS NULL)
          GROUP BY ca."campaignId") app_stats ON ((c.id = app_stats."campaignId")))
     LEFT JOIN ( SELECT ca."campaignId",
            count(co.*) AS content_count,
            count(
                CASE
                    WHEN (co.status = 'APPROVED'::text) THEN 1
                    ELSE NULL::integer
                END) AS approved_content_count
           FROM (public.campaign_applications ca
             LEFT JOIN public.contents co ON ((ca.id = co."applicationId")))
          WHERE (ca."deletedAt" IS NULL)
          GROUP BY ca."campaignId") content_stats ON ((c.id = content_stats."campaignId")))
  WHERE (c."deletedAt" IS NULL);


--
-- Name: category_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category_pages (
    id text NOT NULL,
    "categoryId" text NOT NULL,
    title text NOT NULL,
    content jsonb NOT NULL,
    layout text DEFAULT 'grid'::text,
    "heroSection" jsonb,
    "featuredSection" jsonb,
    "filterOptions" jsonb,
    "customSections" jsonb,
    "seoSettings" jsonb,
    "isPublished" boolean DEFAULT false NOT NULL,
    "publishedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id text NOT NULL,
    "postId" text NOT NULL,
    "authorId" text NOT NULL,
    content text NOT NULL,
    "parentId" text,
    status text DEFAULT 'PUBLISHED'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: content_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_media (
    id text NOT NULL,
    "contentId" text NOT NULL,
    "fileId" text NOT NULL,
    type text NOT NULL,
    "order" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id text NOT NULL,
    type text NOT NULL,
    amount double precision NOT NULL,
    "referenceId" text,
    description text,
    metadata jsonb,
    date timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.files (
    id text NOT NULL,
    "userId" text NOT NULL,
    filename text NOT NULL,
    "originalName" text NOT NULL,
    mimetype text NOT NULL,
    size integer NOT NULL,
    path text NOT NULL,
    url text NOT NULL,
    type text NOT NULL,
    metadata text DEFAULT '{}'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: follows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follows (
    id text NOT NULL,
    "followerId" text NOT NULL,
    "followingId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: index_usage_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.index_usage_stats AS
 SELECT schemaname,
    relname AS table_name,
    indexrelname AS index_name,
    idx_scan,
        CASE
            WHEN (idx_scan = 0) THEN 'UNUSED'::text
            WHEN (idx_scan < 10) THEN 'LOW_USAGE'::text
            WHEN (idx_scan < 100) THEN 'MEDIUM_USAGE'::text
            ELSE 'HIGH_USAGE'::text
        END AS usage_level
   FROM pg_stat_user_indexes
  WHERE (schemaname = 'public'::name)
  ORDER BY idx_scan DESC;


--
-- Name: language_packs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.language_packs (
    id text NOT NULL,
    key text NOT NULL,
    ko text NOT NULL,
    en text NOT NULL,
    category text NOT NULL,
    description text,
    "isEditable" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    jp text NOT NULL
);


--
-- Name: logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logs (
    id text NOT NULL,
    level character varying(10) NOT NULL,
    message text NOT NULL,
    context jsonb,
    "userId" text,
    "requestId" character varying(50),
    "errorStack" text,
    component character varying(100),
    operation character varying(100),
    duration integer,
    metadata jsonb,
    "ipAddress" character varying(45),
    "userAgent" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: notification_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_settings (
    id text NOT NULL,
    "userId" text NOT NULL,
    email boolean DEFAULT true NOT NULL,
    push boolean DEFAULT true NOT NULL,
    sms boolean DEFAULT false NOT NULL,
    "campaignUpdates" boolean DEFAULT true NOT NULL,
    "applicationUpdates" boolean DEFAULT true NOT NULL,
    "paymentUpdates" boolean DEFAULT true NOT NULL,
    marketing boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id text NOT NULL,
    "userId" text NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    "actionUrl" text,
    "readAt" timestamp(3) without time zone,
    metadata text DEFAULT '{}'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: post_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_likes (
    id text NOT NULL,
    "postId" text NOT NULL,
    "userId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: post_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_translations (
    id text NOT NULL,
    "postId" text NOT NULL,
    language text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    "isAutoTranslated" boolean DEFAULT true NOT NULL,
    "lastEditedBy" text,
    "editedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posts (
    id text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    "authorId" text NOT NULL,
    category text NOT NULL,
    status text DEFAULT 'PUBLISHED'::text NOT NULL,
    views integer DEFAULT 0 NOT NULL,
    likes integer DEFAULT 0 NOT NULL,
    "isPinned" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone
);


--
-- Name: refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refunds (
    id text NOT NULL,
    "paymentId" text NOT NULL,
    amount double precision NOT NULL,
    reason text NOT NULL,
    status text NOT NULL,
    "processedAt" timestamp(3) without time zone NOT NULL,
    metadata text DEFAULT '{}'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id text NOT NULL,
    "reporterId" text NOT NULL,
    type text NOT NULL,
    "targetId" text NOT NULL,
    reason text NOT NULL,
    description text,
    status text DEFAULT 'pending'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    "adminNotes" text,
    "resolvedAt" timestamp(3) without time zone,
    "resolvedBy" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: revenues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.revenues (
    id text NOT NULL,
    type text NOT NULL,
    amount double precision NOT NULL,
    "referenceId" text,
    description text,
    metadata jsonb,
    date timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: saved_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_campaigns (
    id text NOT NULL,
    "userId" text NOT NULL,
    "campaignId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: settlement_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settlement_items (
    id text NOT NULL,
    "settlementId" text NOT NULL,
    "applicationId" text NOT NULL,
    amount double precision NOT NULL,
    "campaignTitle" text NOT NULL
);


--
-- Name: settlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settlements (
    id text NOT NULL,
    "influencerId" text NOT NULL,
    "totalAmount" double precision NOT NULL,
    status text NOT NULL,
    "bankAccount" text NOT NULL,
    "adminNotes" text,
    "processedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: site_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_config (
    id text NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    type text DEFAULT 'string'::text NOT NULL,
    category text,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: social_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_accounts (
    id text NOT NULL,
    "userId" text NOT NULL,
    provider text NOT NULL,
    "providerUserId" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "profileImage" text,
    "profileData" jsonb,
    "expiresAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: ui_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ui_sections (
    id text NOT NULL,
    "sectionId" text NOT NULL,
    type text NOT NULL,
    title text,
    subtitle text,
    content jsonb,
    "order" integer DEFAULT 0 NOT NULL,
    visible boolean DEFAULT true NOT NULL,
    translations jsonb,
    settings jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: user_complete; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.user_complete AS
 SELECT u.id,
    u.email,
    u.password,
    u.name,
    u.type,
    u.status,
    u."statusReason",
    u."statusUpdatedAt",
    u."createdAt",
    u."updatedAt",
    u."lastLogin",
    u.verified,
    u."deletedAt",
    p.bio AS influencer_bio,
    p."profileImage" AS influencer_profile_image,
    p.phone AS influencer_phone,
    p."birthYear" AS influencer_birth_year,
    p.gender AS influencer_gender,
    p.instagram AS influencer_instagram,
    p."instagramFollowers" AS influencer_instagram_followers,
    p.youtube AS influencer_youtube,
    p."youtubeSubscribers" AS influencer_youtube_subscribers,
    p.categories AS influencer_categories,
    p."isVerified" AS influencer_verified,
    p."followerCount" AS influencer_total_followers,
    bp."companyName" AS business_company_name,
    bp."businessNumber" AS business_number,
    bp."representativeName" AS business_representative,
    bp."businessAddress" AS business_address,
    bp."businessCategory" AS business_category,
    bp."isVerified" AS business_verified,
        CASE
            WHEN ((u.type = 'INFLUENCER'::text) AND (p."isVerified" = true)) THEN 'VERIFIED_INFLUENCER'::text
            WHEN ((u.type = 'BUSINESS'::text) AND (bp."isVerified" = true)) THEN 'VERIFIED_BUSINESS'::text
            WHEN (u.type = 'ADMIN'::text) THEN 'ADMIN'::text
            ELSE u.type
        END AS user_status,
    (COALESCE(p."profileCompleted", false) OR COALESCE(bp."isVerified", false)) AS profile_complete
   FROM ((public.users u
     LEFT JOIN public.profiles p ON ((u.id = p."userId")))
     LEFT JOIN public.business_profiles bp ON ((u.id = bp."userId")))
  WHERE (u."deletedAt" IS NULL);


--
-- Name: withdrawal_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.withdrawal_accounts (
    id text NOT NULL,
    "userId" text NOT NULL,
    "bankName" text NOT NULL,
    "accountNumber" text NOT NULL,
    "accountHolder" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
)
PARTITION BY RANGE (inserted_at);


--
-- Name: schema_migrations; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


--
-- Name: subscription; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.subscription (
    id bigint NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: subscription_id_seq; Type: SEQUENCE; Schema: realtime; Owner: -
--

ALTER TABLE realtime.subscription ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME realtime.subscription_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL
);


--
-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_analytics (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: migrations; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb,
    level integer
);


--
-- Name: prefixes; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.prefixes (
    bucket_id text NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    level integer GENERATED ALWAYS AS (storage.get_level(name)) STORED NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb
);


--
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: api_config api_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_config
    ADD CONSTRAINT api_config_pkey PRIMARY KEY (id);


--
-- Name: application_templates application_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_templates
    ADD CONSTRAINT application_templates_pkey PRIMARY KEY (id);


--
-- Name: business_profiles business_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_profiles
    ADD CONSTRAINT business_profiles_pkey PRIMARY KEY (id);


--
-- Name: campaign_applications campaign_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_applications
    ADD CONSTRAINT campaign_applications_pkey PRIMARY KEY (id);


--
-- Name: campaign_categories campaign_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_categories
    ADD CONSTRAINT campaign_categories_pkey PRIMARY KEY (id);


--
-- Name: campaign_hashtags campaign_hashtags_campaignId_hashtag_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_hashtags
    ADD CONSTRAINT "campaign_hashtags_campaignId_hashtag_key" UNIQUE ("campaignId", hashtag);


--
-- Name: campaign_hashtags campaign_hashtags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_hashtags
    ADD CONSTRAINT campaign_hashtags_pkey PRIMARY KEY (id);


--
-- Name: campaign_images campaign_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_images
    ADD CONSTRAINT campaign_images_pkey PRIMARY KEY (id);


--
-- Name: campaign_keywords campaign_keywords_campaignId_keyword_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_keywords
    ADD CONSTRAINT "campaign_keywords_campaignId_keyword_key" UNIQUE ("campaignId", keyword);


--
-- Name: campaign_keywords campaign_keywords_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_keywords
    ADD CONSTRAINT campaign_keywords_pkey PRIMARY KEY (id);


--
-- Name: campaign_likes campaign_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_likes
    ADD CONSTRAINT campaign_likes_pkey PRIMARY KEY (id);


--
-- Name: campaign_platforms campaign_platforms_campaignId_platform_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_platforms
    ADD CONSTRAINT "campaign_platforms_campaignId_platform_key" UNIQUE ("campaignId", platform);


--
-- Name: campaign_platforms campaign_platforms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_platforms
    ADD CONSTRAINT campaign_platforms_pkey PRIMARY KEY (id);


--
-- Name: campaign_questions campaign_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_questions
    ADD CONSTRAINT campaign_questions_pkey PRIMARY KEY (id);


--
-- Name: campaign_templates campaign_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_templates
    ADD CONSTRAINT campaign_templates_pkey PRIMARY KEY (id);


--
-- Name: campaign_translations campaign_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_translations
    ADD CONSTRAINT campaign_translations_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: category_pages category_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_pages
    ADD CONSTRAINT category_pages_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: content_media content_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_media
    ADD CONSTRAINT content_media_pkey PRIMARY KEY (id);


--
-- Name: contents contents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contents
    ADD CONSTRAINT contents_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: follows follows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_pkey PRIMARY KEY (id);


--
-- Name: language_packs language_packs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.language_packs
    ADD CONSTRAINT language_packs_pkey PRIMARY KEY (id);


--
-- Name: logs logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs
    ADD CONSTRAINT logs_pkey PRIMARY KEY (id);


--
-- Name: notification_settings notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: post_likes post_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_likes
    ADD CONSTRAINT post_likes_pkey PRIMARY KEY (id);


--
-- Name: post_translations post_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_translations
    ADD CONSTRAINT post_translations_pkey PRIMARY KEY (id);


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: refunds refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: revenues revenues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revenues
    ADD CONSTRAINT revenues_pkey PRIMARY KEY (id);


--
-- Name: saved_campaigns saved_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_campaigns
    ADD CONSTRAINT saved_campaigns_pkey PRIMARY KEY (id);


--
-- Name: settlement_items settlement_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_items
    ADD CONSTRAINT settlement_items_pkey PRIMARY KEY (id);


--
-- Name: settlements settlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlements
    ADD CONSTRAINT settlements_pkey PRIMARY KEY (id);


--
-- Name: site_config site_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_config
    ADD CONSTRAINT site_config_pkey PRIMARY KEY (id);


--
-- Name: social_accounts social_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_accounts
    ADD CONSTRAINT social_accounts_pkey PRIMARY KEY (id);


--
-- Name: ui_sections ui_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ui_sections
    ADD CONSTRAINT ui_sections_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: withdrawal_accounts withdrawal_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_accounts
    ADD CONSTRAINT withdrawal_accounts_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: subscription pk_subscription; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.subscription
    ADD CONSTRAINT pk_subscription PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: buckets_analytics buckets_analytics_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_analytics
    ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: prefixes prefixes_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.prefixes
    ADD CONSTRAINT prefixes_pkey PRIMARY KEY (bucket_id, level, name);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- Name: api_config_service_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_config_service_idx ON public.api_config USING btree (service);


--
-- Name: api_config_service_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX api_config_service_key ON public.api_config USING btree (service);


--
-- Name: application_templates_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX application_templates_category_idx ON public.application_templates USING btree (category);


--
-- Name: application_templates_isPublic_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "application_templates_isPublic_idx" ON public.application_templates USING btree ("isPublic");


--
-- Name: application_templates_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "application_templates_userId_idx" ON public.application_templates USING btree ("userId");


--
-- Name: business_profiles_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "business_profiles_userId_key" ON public.business_profiles USING btree ("userId");


--
-- Name: campaign_applications_campaignId_influencerId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "campaign_applications_campaignId_influencerId_key" ON public.campaign_applications USING btree ("campaignId", "influencerId");


--
-- Name: campaign_categories_campaignId_categoryId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "campaign_categories_campaignId_categoryId_key" ON public.campaign_categories USING btree ("campaignId", "categoryId");


--
-- Name: campaign_categories_campaignId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "campaign_categories_campaignId_idx" ON public.campaign_categories USING btree ("campaignId");


--
-- Name: campaign_categories_categoryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "campaign_categories_categoryId_idx" ON public.campaign_categories USING btree ("categoryId");


--
-- Name: campaign_likes_campaignId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "campaign_likes_campaignId_userId_key" ON public.campaign_likes USING btree ("campaignId", "userId");


--
-- Name: campaign_templates_businessId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "campaign_templates_businessId_idx" ON public.campaign_templates USING btree ("businessId");


--
-- Name: campaign_translations_campaignId_language_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "campaign_translations_campaignId_language_key" ON public.campaign_translations USING btree ("campaignId", language);


--
-- Name: campaign_translations_language_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_translations_language_idx ON public.campaign_translations USING btree (language);


--
-- Name: campaigns_businessId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "campaigns_businessId_status_idx" ON public.campaigns USING btree ("businessId", status);


--
-- Name: campaigns_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "campaigns_createdAt_idx" ON public.campaigns USING btree ("createdAt");


--
-- Name: campaigns_startDate_endDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "campaigns_startDate_endDate_idx" ON public.campaigns USING btree ("startDate", "endDate");


--
-- Name: campaigns_status_deletedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "campaigns_status_deletedAt_idx" ON public.campaigns USING btree (status, "deletedAt");


--
-- Name: categories_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "categories_isActive_idx" ON public.categories USING btree ("isActive");


--
-- Name: categories_level_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX categories_level_idx ON public.categories USING btree (level);


--
-- Name: categories_parentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "categories_parentId_idx" ON public.categories USING btree ("parentId");


--
-- Name: categories_showInMenu_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "categories_showInMenu_idx" ON public.categories USING btree ("showInMenu");


--
-- Name: categories_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX categories_slug_key ON public.categories USING btree (slug);


--
-- Name: category_pages_categoryId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "category_pages_categoryId_key" ON public.category_pages USING btree ("categoryId");


--
-- Name: category_pages_isPublished_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "category_pages_isPublished_idx" ON public.category_pages USING btree ("isPublished");


--
-- Name: expenses_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_date_idx ON public.expenses USING btree (date);


--
-- Name: expenses_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_type_idx ON public.expenses USING btree (type);


--
-- Name: follows_followerId_followingId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "follows_followerId_followingId_key" ON public.follows USING btree ("followerId", "followingId");


--
-- Name: idx_applications_campaign_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_campaign_status_created ON public.campaign_applications USING btree ("campaignId", status, "createdAt") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_applications_created_date_trunc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_created_date_trunc ON public.campaign_applications USING btree (date_trunc('day'::text, "createdAt"), status) WHERE ("deletedAt" IS NULL);


--
-- Name: idx_applications_recent_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_recent_activity ON public.campaign_applications USING btree ("createdAt" DESC, status) WHERE ("deletedAt" IS NULL);


--
-- Name: idx_business_profiles_verified; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_profiles_verified ON public.business_profiles USING btree ("isVerified");


--
-- Name: idx_business_profiles_verified_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_profiles_verified_created ON public.business_profiles USING btree ("isVerified", "createdAt" DESC);


--
-- Name: idx_campaign_applications_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_applications_status_created ON public.campaign_applications USING btree (status, "createdAt") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_campaign_categories_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_categories_campaign_id ON public.campaign_categories USING btree ("campaignId");


--
-- Name: idx_campaign_categories_category_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_categories_category_campaign ON public.campaign_categories USING btree ("categoryId", "campaignId", "isPrimary");


--
-- Name: idx_campaign_categories_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_categories_category_id ON public.campaign_categories USING btree ("categoryId");


--
-- Name: idx_campaign_hashtags_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_hashtags_campaign_id ON public.campaign_hashtags USING btree ("campaignId");


--
-- Name: idx_campaign_hashtags_hashtag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_hashtags_hashtag ON public.campaign_hashtags USING btree (hashtag);


--
-- Name: idx_campaign_images_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_images_campaign_id ON public.campaign_images USING btree ("campaignId");


--
-- Name: idx_campaign_images_campaign_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_images_campaign_type ON public.campaign_images USING btree ("campaignId", type);


--
-- Name: idx_campaign_images_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_images_type ON public.campaign_images USING btree (type);


--
-- Name: idx_campaign_keywords_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_keywords_campaign_id ON public.campaign_keywords USING btree ("campaignId");


--
-- Name: idx_campaign_keywords_keyword; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_keywords_keyword ON public.campaign_keywords USING btree (keyword);


--
-- Name: idx_campaign_platforms_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_platforms_campaign_id ON public.campaign_platforms USING btree ("campaignId");


--
-- Name: idx_campaign_platforms_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_platforms_platform ON public.campaign_platforms USING btree (platform);


--
-- Name: idx_campaign_platforms_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_platforms_primary ON public.campaign_platforms USING btree ("campaignId", "isPrimary");


--
-- Name: idx_campaign_questions_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_questions_campaign_id ON public.campaign_questions USING btree ("campaignId");


--
-- Name: idx_campaign_questions_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_questions_order ON public.campaign_questions USING btree ("campaignId", "order");


--
-- Name: idx_campaigns_active_applications; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_active_applications ON public.campaigns USING btree (status, "applicationEndDate", "maxApplicants", "createdAt" DESC) WHERE (("deletedAt" IS NULL) AND (status = 'ACTIVE'::text));


--
-- Name: idx_campaigns_business_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_business_status ON public.campaigns USING btree ("businessId", status) WHERE ("deletedAt" IS NULL);


--
-- Name: idx_campaigns_created_date_trunc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_created_date_trunc ON public.campaigns USING btree (date_trunc('day'::text, "createdAt"), status) WHERE ("deletedAt" IS NULL);


--
-- Name: idx_campaigns_hashtags_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_hashtags_gin ON public.campaigns USING gin (hashtags jsonb_path_ops) WHERE (hashtags IS NOT NULL);


--
-- Name: idx_campaigns_location_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_location_status ON public.campaigns USING btree (location, status) WHERE (("deletedAt" IS NULL) AND (location IS NOT NULL));


--
-- Name: idx_campaigns_platform_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_platform_status_created ON public.campaigns USING btree (platform, status, "createdAt" DESC) WHERE ("deletedAt" IS NULL);


--
-- Name: idx_campaigns_platforms_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_platforms_gin ON public.campaigns USING gin (platforms jsonb_path_ops) WHERE (platforms IS NOT NULL);


--
-- Name: idx_campaigns_recent_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_recent_activity ON public.campaigns USING btree ("createdAt" DESC, status) WHERE ("deletedAt" IS NULL);


--
-- Name: idx_campaigns_status_budget_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_status_budget_desc ON public.campaigns USING btree (status, budget DESC NULLS LAST) WHERE (("deletedAt" IS NULL) AND (budget IS NOT NULL));


--
-- Name: idx_campaigns_status_created_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_status_created_business ON public.campaigns USING btree (status, "createdAt" DESC, "businessId") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_campaigns_status_enddate_asc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_status_enddate_asc ON public.campaigns USING btree (status, "endDate") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_campaigns_status_reward_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_status_reward_desc ON public.campaigns USING btree (status, "rewardAmount" DESC) WHERE ("deletedAt" IS NULL);


--
-- Name: idx_campaigns_title_description_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_title_description_fts ON public.campaigns USING gin (to_tsvector('english'::regconfig, ((title || ' '::text) || COALESCE(description, ''::text))));


--
-- Name: idx_categories_active_menu_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_active_menu_order ON public.categories USING btree ("isActive", "showInMenu", "menuOrder", "order");


--
-- Name: idx_files_user_type_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_user_type_created ON public.files USING btree ("userId", type, "createdAt" DESC);


--
-- Name: idx_logs_level_created_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_level_created_user ON public.logs USING btree (level, "createdAt" DESC, "userId");


--
-- Name: idx_notifications_user_created_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_created_read ON public.notifications USING btree ("userId", "createdAt" DESC, "readAt");


--
-- Name: idx_payments_status_amount; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_status_amount ON public.payments USING btree (status, amount);


--
-- Name: idx_payments_status_created_amount; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_status_created_amount ON public.payments USING btree (status, "createdAt" DESC, amount) WHERE (status = ANY (ARRAY['COMPLETED'::text, 'PENDING'::text]));


--
-- Name: idx_profiles_verified; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_verified ON public.profiles USING btree ("isVerified");


--
-- Name: idx_profiles_verified_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_verified_created ON public.profiles USING btree ("isVerified", "createdAt" DESC);


--
-- Name: idx_settlements_influencer_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settlements_influencer_status_created ON public.settlements USING btree ("influencerId", status, "createdAt" DESC);


--
-- Name: idx_users_created_date_trunc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_created_date_trunc ON public.users USING btree (date_trunc('day'::text, "createdAt"), type) WHERE ("deletedAt" IS NULL);


--
-- Name: idx_users_last_login; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_last_login ON public.users USING btree ("lastLogin") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_users_name_email_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_name_email_fts ON public.users USING gin (to_tsvector('english'::regconfig, ((name || ' '::text) || email)));


--
-- Name: idx_users_recent_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_recent_activity ON public.users USING btree ("createdAt" DESC, type) WHERE ("deletedAt" IS NULL);


--
-- Name: idx_users_type_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_type_created ON public.users USING btree (type, "createdAt") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_users_type_lastlogin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_type_lastlogin ON public.users USING btree (type, "lastLogin" DESC) WHERE (("deletedAt" IS NULL) AND ("lastLogin" IS NOT NULL));


--
-- Name: idx_users_type_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_type_status_created ON public.users USING btree (type, status, "createdAt" DESC) WHERE ("deletedAt" IS NULL);


--
-- Name: language_packs_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX language_packs_category_idx ON public.language_packs USING btree (category);


--
-- Name: language_packs_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX language_packs_key_key ON public.language_packs USING btree (key);


--
-- Name: logs_component_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX logs_component_idx ON public.logs USING btree (component);


--
-- Name: logs_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "logs_createdAt_idx" ON public.logs USING btree ("createdAt");


--
-- Name: logs_level_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX logs_level_idx ON public.logs USING btree (level);


--
-- Name: logs_requestId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "logs_requestId_idx" ON public.logs USING btree ("requestId");


--
-- Name: logs_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "logs_userId_idx" ON public.logs USING btree ("userId");


--
-- Name: notification_settings_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "notification_settings_userId_key" ON public.notification_settings USING btree ("userId");


--
-- Name: payments_orderId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "payments_orderId_key" ON public.payments USING btree ("orderId");


--
-- Name: post_likes_postId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "post_likes_postId_userId_key" ON public.post_likes USING btree ("postId", "userId");


--
-- Name: post_translations_language_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX post_translations_language_idx ON public.post_translations USING btree (language);


--
-- Name: post_translations_postId_language_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "post_translations_postId_language_key" ON public.post_translations USING btree ("postId", language);


--
-- Name: profiles_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "profiles_userId_key" ON public.profiles USING btree ("userId");


--
-- Name: revenues_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX revenues_date_idx ON public.revenues USING btree (date);


--
-- Name: revenues_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX revenues_type_idx ON public.revenues USING btree (type);


--
-- Name: saved_campaigns_userId_campaignId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "saved_campaigns_userId_campaignId_key" ON public.saved_campaigns USING btree ("userId", "campaignId");


--
-- Name: site_config_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX site_config_category_idx ON public.site_config USING btree (category);


--
-- Name: site_config_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX site_config_key_idx ON public.site_config USING btree (key);


--
-- Name: site_config_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX site_config_key_key ON public.site_config USING btree (key);


--
-- Name: social_accounts_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_accounts_provider_idx ON public.social_accounts USING btree (provider);


--
-- Name: social_accounts_userId_provider_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "social_accounts_userId_provider_key" ON public.social_accounts USING btree ("userId", provider);


--
-- Name: ui_sections_sectionId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ui_sections_sectionId_key" ON public.ui_sections USING btree ("sectionId");


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: withdrawal_accounts_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "withdrawal_accounts_userId_key" ON public.withdrawal_accounts USING btree ("userId");


--
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- Name: subscription_subscription_id_entity_filters_key; Type: INDEX; Schema: realtime; Owner: -
--

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_key ON realtime.subscription USING btree (subscription_id, entity, filters);


--
-- Name: bname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- Name: bucketid_objname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);


--
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- Name: idx_name_bucket_level_unique; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX idx_name_bucket_level_unique ON storage.objects USING btree (name COLLATE "C", bucket_id, level);


--
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- Name: idx_objects_lower_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_lower_name ON storage.objects USING btree ((path_tokens[level]), lower(name) text_pattern_ops, bucket_id, level);


--
-- Name: idx_prefixes_lower_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_prefixes_lower_name ON storage.prefixes USING btree (bucket_id, level, ((string_to_array(name, '/'::text))[level]), lower(name) text_pattern_ops);


--
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- Name: objects_bucket_id_level_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX objects_bucket_id_level_idx ON storage.objects USING btree (bucket_id, level, name COLLATE "C");


--
-- Name: subscription tr_check_filters; Type: TRIGGER; Schema: realtime; Owner: -
--

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


--
-- Name: buckets enforce_bucket_name_length_trigger; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();


--
-- Name: objects objects_delete_delete_prefix; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER objects_delete_delete_prefix AFTER DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();


--
-- Name: objects objects_insert_create_prefix; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER objects_insert_create_prefix BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.objects_insert_prefix_trigger();


--
-- Name: objects objects_update_create_prefix; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER objects_update_create_prefix BEFORE UPDATE ON storage.objects FOR EACH ROW WHEN (((new.name <> old.name) OR (new.bucket_id <> old.bucket_id))) EXECUTE FUNCTION storage.objects_update_prefix_trigger();


--
-- Name: prefixes prefixes_create_hierarchy; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER prefixes_create_hierarchy BEFORE INSERT ON storage.prefixes FOR EACH ROW WHEN ((pg_trigger_depth() < 1)) EXECUTE FUNCTION storage.prefixes_insert_trigger();


--
-- Name: prefixes prefixes_delete_hierarchy; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER prefixes_delete_hierarchy AFTER DELETE ON storage.prefixes FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();


--
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: application_templates application_templates_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_templates
    ADD CONSTRAINT "application_templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: business_profiles business_profiles_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_profiles
    ADD CONSTRAINT "business_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campaign_applications campaign_applications_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_applications
    ADD CONSTRAINT "campaign_applications_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public.campaigns(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campaign_applications campaign_applications_influencerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_applications
    ADD CONSTRAINT "campaign_applications_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campaign_categories campaign_categories_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_categories
    ADD CONSTRAINT "campaign_categories_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public.campaigns(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campaign_categories campaign_categories_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_categories
    ADD CONSTRAINT "campaign_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public.categories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campaign_hashtags campaign_hashtags_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_hashtags
    ADD CONSTRAINT "campaign_hashtags_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public.campaigns(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campaign_images campaign_images_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_images
    ADD CONSTRAINT "campaign_images_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public.campaigns(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campaign_keywords campaign_keywords_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_keywords
    ADD CONSTRAINT "campaign_keywords_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public.campaigns(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campaign_likes campaign_likes_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_likes
    ADD CONSTRAINT "campaign_likes_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public.campaigns(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campaign_likes campaign_likes_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_likes
    ADD CONSTRAINT "campaign_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campaign_platforms campaign_platforms_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_platforms
    ADD CONSTRAINT "campaign_platforms_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public.campaigns(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campaign_questions campaign_questions_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_questions
    ADD CONSTRAINT "campaign_questions_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public.campaigns(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campaign_templates campaign_templates_businessId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_templates
    ADD CONSTRAINT "campaign_templates_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campaign_translations campaign_translations_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_translations
    ADD CONSTRAINT "campaign_translations_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public.campaigns(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campaign_translations campaign_translations_lastEditedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_translations
    ADD CONSTRAINT "campaign_translations_lastEditedBy_fkey" FOREIGN KEY ("lastEditedBy") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: campaigns campaigns_businessId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT "campaigns_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: categories categories_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.categories(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: category_pages category_pages_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_pages
    ADD CONSTRAINT "category_pages_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public.categories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: comments comments_authorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT "comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: comments comments_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.comments(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: comments comments_postId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT "comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES public.posts(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: content_media content_media_contentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_media
    ADD CONSTRAINT "content_media_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES public.contents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: content_media content_media_fileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_media
    ADD CONSTRAINT "content_media_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES public.files(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: contents contents_applicationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contents
    ADD CONSTRAINT "contents_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES public.campaign_applications(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: files files_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT "files_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: follows follows_followerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT "follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: follows follows_followingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT "follows_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: logs logs_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs
    ADD CONSTRAINT "logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: notification_settings notification_settings_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT "notification_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notifications notifications_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: payments payments_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "payments_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public.campaigns(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: payments payments_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: post_likes post_likes_postId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_likes
    ADD CONSTRAINT "post_likes_postId_fkey" FOREIGN KEY ("postId") REFERENCES public.posts(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: post_likes post_likes_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_likes
    ADD CONSTRAINT "post_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: post_translations post_translations_lastEditedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_translations
    ADD CONSTRAINT "post_translations_lastEditedBy_fkey" FOREIGN KEY ("lastEditedBy") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: post_translations post_translations_postId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_translations
    ADD CONSTRAINT "post_translations_postId_fkey" FOREIGN KEY ("postId") REFERENCES public.posts(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: posts posts_authorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT "posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: profiles profiles_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT "profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: refunds refunds_paymentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES public.payments(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: reports reports_reporterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: saved_campaigns saved_campaigns_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_campaigns
    ADD CONSTRAINT "saved_campaigns_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public.campaigns(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: saved_campaigns saved_campaigns_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_campaigns
    ADD CONSTRAINT "saved_campaigns_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: settlement_items settlement_items_applicationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_items
    ADD CONSTRAINT "settlement_items_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES public.campaign_applications(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: settlement_items settlement_items_settlementId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_items
    ADD CONSTRAINT "settlement_items_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES public.settlements(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: settlements settlements_influencerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlements
    ADD CONSTRAINT "settlements_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: social_accounts social_accounts_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_accounts
    ADD CONSTRAINT "social_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: withdrawal_accounts withdrawal_accounts_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_accounts
    ADD CONSTRAINT "withdrawal_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: prefixes prefixes_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.prefixes
    ADD CONSTRAINT "prefixes_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_analytics; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: prefixes; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.prefixes ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


--
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


--
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


--
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE FUNCTION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


--
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


--
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


--
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


--
-- PostgreSQL database dump complete
--

\unrestrict okeZF0cw2Bj92AJZGMoyvp4lNXpucXwBxBFgxYPcAtNV2zDb6jNullpfClvNsLh

