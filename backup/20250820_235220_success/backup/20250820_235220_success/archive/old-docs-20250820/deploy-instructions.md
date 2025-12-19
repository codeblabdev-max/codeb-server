# Manual Deployment Instructions for video-platform

## Option 1: Using the API Server (Recommended)

### 1. Upload Prisma schema via API
Since SSH is not available, we need to manually update the project files.

### 2. Steps to follow:

1. Access the server somehow (console, VNC, or wait for SSH to be available)

2. Create Prisma directory in the container:
```bash
podman exec video-platform-app mkdir -p /app/prisma
```

3. Create the schema.prisma file:
```bash
podman exec video-platform-app sh -c "cat > /app/prisma/schema.prisma << 'SCHEMA'
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model application_templates {
  id        String   @id
  name      String
  content   String
  userId    String?
  isPublic  Boolean  @default(true)
  category  String?
  useCount  Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime
  users     users?   @relation(fields: [userId], references: [id])

  @@index([category])
  @@index([isPublic])
  @@index([userId])
}

model business_profiles {
  id                   String    @id
  userId               String    @unique
  companyName          String
  businessNumber       String
  representativeName   String
  businessAddress      String
  businessCategory     String
  isVerified           Boolean   @default(false)
  verificationNotes    String?
  verifiedAt           DateTime?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime
  businessFileName     String?
  businessFileSize     Int?
  businessRegistration String?
  users                users     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model campaign_applications {
  id               String             @id
  campaignId       String
  influencerId     String
  message          String
  proposedPrice    Float?
  status           String             @default("PENDING")
  reviewedAt       DateTime?
  rejectionReason  String?
  createdAt        DateTime           @default(now())
  updatedAt        DateTime
  campaigns        campaigns          @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  users            users              @relation(fields: [influencerId], references: [id], onDelete: Cascade)
  contents         contents[]
  settlement_items settlement_items[]

  @@unique([campaignId, influencerId])
}

model campaign_likes {
  id         String    @id
  campaignId String
  userId     String
  createdAt  DateTime  @default(now())
  campaigns  campaigns @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  users      users     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([campaignId, userId])
}

model campaign_templates {
  id          String   @id
  businessId  String
  name        String
  description String?
  data        Json
  isDefault   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime
  users       users    @relation(fields: [businessId], references: [id], onDelete: Cascade)

  @@index([businessId])
}

model campaigns {
  id                    String                  @id
  businessId            String
  title                 String
  description           String
  platform              String
  budget                Float
  targetFollowers       Int
  startDate             DateTime
  endDate               DateTime
  requirements          String?
  hashtags              String?
  imageUrl              String?
  imageId               String?
  status                String                  @default("DRAFT")
  isPaid                Boolean                 @default(false)
  reviewFeedback        String?
  reviewedAt            DateTime?
  createdAt             DateTime                @default(now())
  updatedAt             DateTime
  deliverables          String?
  detailedRequirements  String?
  location              String                  @default("전국")
  maxApplicants         Int                     @default(100)
  productImages         Json?
  productIntro          String?
  viewCount             Int                     @default(0)
  detailImages          Json?
  platforms             String?
  rewardAmount          Float                   @default(0)
  headerImageUrl        String?
  thumbnailImageUrl     String?
  announcementDate      DateTime?
  questions             Json?
  platformFeeRate       Float                   @default(0.2)
  channelId             String?
  dislikeCount          Int                     @default(0)
  duration              Int?
  isLive                Boolean                 @default(false)
  likeCount             Int                     @default(0)
  streamKey             String?
  videoUrl              String?
  campaign_applications campaign_applications[]
  campaign_likes        campaign_likes[]
  users                 users                   @relation(fields: [businessId], references: [id], onDelete: Cascade)
  channels              channels?               @relation(fields: [channelId], references: [id])
  payments              payments[]
  saved_campaigns       saved_campaigns[]
  super_chats           super_chats[]
  video_comments        video_comments[]
  video_likes           video_likes[]
  watch_history         watch_history[]
}

model channels {
  id                   String                @id
  userId               String                @unique
  name                 String
  handle               String                @unique
  description          String?
  bannerUrl            String?
  avatarUrl            String?
  isVerified           Boolean               @default(false)
  subscriberCount      Int                   @default(0)
  videoCount           Int                   @default(0)
  totalViews           BigInt                @default(0)
  totalSuperChatAmount Float                 @default(0)
  totalEarnings        Float                 @default(0)
  pendingSettlement    Float                 @default(0)
  createdAt            DateTime              @default(now())
  updatedAt            DateTime
  campaigns            campaigns[]
  users                users                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  creator_earnings     creator_earnings[]
  live_streams         live_streams[]
  settlement_requests  settlement_requests[]
  subscriptions        subscriptions[]
  super_chats          super_chats[]
  videos               videos[]

  @@index([handle])
}

model comments {
  id             String     @id
  postId         String
  authorId       String
  content        String
  parentId       String?
  status         String     @default("PUBLISHED")
  createdAt      DateTime   @default(now())
  updatedAt      DateTime
  users          users      @relation(fields: [authorId], references: [id], onDelete: Cascade)
  comments       comments?  @relation("commentsTocomments", fields: [parentId], references: [id])
  other_comments comments[] @relation("commentsTocomments")
  posts          posts      @relation(fields: [postId], references: [id], onDelete: Cascade)
}

model content_media {
  id        String   @id
  contentId String
  fileId    String
  type      String
  order     Int
  createdAt DateTime @default(now())
  contents  contents @relation(fields: [contentId], references: [id], onDelete: Cascade)
  files     files    @relation(fields: [fileId], references: [id], onDelete: Cascade)
}

model contents {
  id                    String                @id
  applicationId         String
  contentUrl            String
  description           String?
  platform              String
  status                String                @default("PENDING_REVIEW")
  feedback              String?
  reviewedAt            DateTime?
  createdAt             DateTime              @default(now())
  updatedAt             DateTime
  content_media         content_media[]
  campaign_applications campaign_applications @relation(fields: [applicationId], references: [id], onDelete: Cascade)
}

model creator_earnings {
  id          String   @id
  channelId   String
  type        String
  amount      Float
  fee         Float    @default(0)
  netAmount   Float
  referenceId String?
  description String?
  month       Int
  year        Int
  createdAt   DateTime @default(now())
  channels    channels @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@index([channelId])
  @@index([month, year])
  @@index([type])
}

model expenses {
  id          String   @id
  type        String
  amount      Float
  referenceId String?
  description String?
  metadata    Json?
  date        DateTime @default(now())
  createdAt   DateTime @default(now())

  @@index([date])
  @@index([type])
}

model files {
  id            String          @id
  userId        String
  filename      String
  originalName  String
  mimetype      String
  size          Int
  path          String
  url           String
  type          String
  metadata      String          @default("{}")
  createdAt     DateTime        @default(now())
  content_media content_media[]
  users         users           @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model follows {
  id                               String   @id
  followerId                       String
  followingId                      String
  createdAt                        DateTime @default(now())
  users_follows_followerIdTousers  users    @relation("follows_followerIdTousers", fields: [followerId], references: [id], onDelete: Cascade)
  users_follows_followingIdTousers users    @relation("follows_followingIdTousers", fields: [followingId], references: [id], onDelete: Cascade)

  @@unique([followerId, followingId])
}

model live_chat_messages {
  id           String       @id
  streamId     String
  userId       String
  content      String
  type         String       @default("message")
  amount       Float?
  isPinned     Boolean      @default(false)
  createdAt    DateTime     @default(now())
  live_streams live_streams @relation(fields: [streamId], references: [id], onDelete: Cascade)
  users        users        @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([streamId])
}

model live_streams {
  id                 String               @id
  channelId          String
  title              String
  description        String?
  thumbnailUrl       String?
  streamKey          String               @unique
  rtmpUrl            String
  webrtcUrl          String?
  hlsUrl             String?
  status             String               @default("preparing")
  viewerCount        Int                  @default(0)
  peakViewers        Int                  @default(0)
  startedAt          DateTime?
  endedAt            DateTime?
  recordingUrl       String?
  isRecording        Boolean              @default(true)
  createdAt          DateTime             @default(now())
  updatedAt          DateTime
  live_chat_messages live_chat_messages[]
  channels           channels             @relation(fields: [channelId], references: [id], onDelete: Cascade)
  super_chats        super_chats[]

  @@index([channelId])
  @@index([status])
}

model notification_settings {
  id                 String   @id
  userId             String   @unique
  email              Boolean  @default(true)
  push               Boolean  @default(true)
  sms                Boolean  @default(false)
  campaignUpdates    Boolean  @default(true)
  applicationUpdates Boolean  @default(true)
  paymentUpdates     Boolean  @default(true)
  marketing          Boolean  @default(false)
  createdAt          DateTime @default(now())
  updatedAt          DateTime
  users              users    @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model notifications {
  id        String    @id
  userId    String
  type      String
  title     String
  message   String
  actionUrl String?
  readAt    DateTime?
  metadata  String    @default("{}")
  createdAt DateTime  @default(now())
  users     users     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model payments {
  id             String        @id
  orderId        String        @unique
  campaignId     String?
  userId         String
  amount         Float
  type           String
  status         String        @default("PENDING")
  paymentMethod  String
  paymentKey     String?
  approvedAt     DateTime?
  failedAt       DateTime?
  failReason     String?
  receipt        String?
  refundedAmount Float         @default(0)
  metadata       String        @default("{}")
  createdAt      DateTime      @default(now())
  updatedAt      DateTime
  campaigns      campaigns?    @relation(fields: [campaignId], references: [id])
  users          users         @relation(fields: [userId], references: [id], onDelete: Cascade)
  refunds        refunds[]
  super_chats    super_chats[]
}

model post_likes {
  id        String   @id
  postId    String
  userId    String
  createdAt DateTime @default(now())
  posts     posts    @relation(fields: [postId], references: [id], onDelete: Cascade)
  users     users    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([postId, userId])
}

model posts {
  id         String       @id
  title      String
  content    String
  authorId   String
  category   String
  status     String       @default("PUBLISHED")
  views      Int          @default(0)
  likes      Int          @default(0)
  isPinned   Boolean      @default(false)
  createdAt  DateTime     @default(now())
  updatedAt  DateTime
  comments   comments[]
  post_likes post_likes[]
  users      users        @relation(fields: [authorId], references: [id], onDelete: Cascade)
}

model profiles {
  id                    String    @id
  userId                String    @unique
  bio                   String?
  profileImage          String?
  profileImageId        String?
  phone                 String?
  instagram             String?
  instagramFollowers    Int?
  youtube               String?
  youtubeSubscribers    Int?
  tiktok                String?
  tiktokFollowers       Int?
  averageEngagementRate Float?
  categories            String?
  isVerified            Boolean   @default(false)
  verificationNotes     String?
  verifiedAt            DateTime?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime
  followerCount         Int       @default(0)
  naverBlog             String?
  address               String?
  bankAccountHolder     String?
  bankAccountNumber     String?
  bankName              String?
  birthYear             Int?
  gender                String?
  users                 users     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model refunds {
  id          String   @id
  paymentId   String
  amount      Float
  reason      String
  status      String
  processedAt DateTime
  metadata    String   @default("{}")
  createdAt   DateTime @default(now())
  payments    payments @relation(fields: [paymentId], references: [id], onDelete: Cascade)
}

model reports {
  id          String    @id
  reporterId  String
  type        String
  targetId    String
  reason      String
  description String?
  status      String    @default("pending")
  priority    String    @default("medium")
  adminNotes  String?
  resolvedAt  DateTime?
  resolvedBy  String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime
  users       users     @relation(fields: [reporterId], references: [id], onDelete: Cascade)
}

model revenues {
  id          String   @id
  type        String
  amount      Float
  referenceId String?
  description String?
  metadata    Json?
  date        DateTime @default(now())
  createdAt   DateTime @default(now())

  @@index([date])
  @@index([type])
}

model saved_campaigns {
  id         String    @id
  userId     String
  campaignId String
  createdAt  DateTime  @default(now())
  campaigns  campaigns @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  users      users     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, campaignId])
}

model settlement_items {
  id                    String                @id
  settlementId          String
  applicationId         String
  amount                Float
  campaignTitle         String
  campaign_applications campaign_applications @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  settlements           settlements           @relation(fields: [settlementId], references: [id], onDelete: Cascade)
}

model settlement_requests {
  id              String    @id
  channelId       String
  amount          Float
  status          String    @default("pending")
  bankName        String?
  bankAccount     String?
  accountHolder   String?
  requestedAt     DateTime  @default(now())
  processedAt     DateTime?
  completedAt     DateTime?
  rejectionReason String?
  adminNotes      String?
  proofUrl        String?
  channels        channels  @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@index([channelId])
  @@index([status])
}

model settlements {
  id               String             @id
  influencerId     String
  totalAmount      Float
  status           String
  bankAccount      String
  adminNotes       String?
  processedAt      DateTime?
  createdAt        DateTime           @default(now())
  updatedAt        DateTime
  settlement_items settlement_items[]
  users            users              @relation(fields: [influencerId], references: [id], onDelete: Cascade)
}

model site_config {
  id        String   @id
  key       String   @unique
  value     String
  updatedAt DateTime
  createdAt DateTime @default(now())

  @@index([key])
}

model subscriptions {
  id              String   @id
  userId          String
  channelId       String
  tier            String   @default("free")
  notificationsOn Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime
  channels        channels @relation(fields: [channelId], references: [id], onDelete: Cascade)
  users           users    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, channelId])
  @@index([channelId])
}

model super_chats {
  id            String        @id
  userId        String
  channelId     String
  videoId       String?
  directVideoId String?
  streamId      String?
  amount        Float
  currency      String        @default("KRW")
  message       String?
  color         String?
  isPaid        Boolean       @default(false)
  paymentId     String?
  createdAt     DateTime      @default(now())
  readAt        DateTime?
  channels      channels      @relation(fields: [channelId], references: [id], onDelete: Cascade)
  videos        videos?       @relation(fields: [directVideoId], references: [id], onDelete: Cascade)
  payments      payments?     @relation(fields: [paymentId], references: [id])
  live_streams  live_streams? @relation(fields: [streamId], references: [id], onDelete: Cascade)
  users         users         @relation(fields: [userId], references: [id], onDelete: Cascade)
  campaigns     campaigns?    @relation(fields: [videoId], references: [id], onDelete: Cascade)

  @@index([channelId])
  @@index([createdAt])
  @@index([userId])
}

model users {
  id                                                  String                  @id
  email                                               String                  @unique
  password                                            String
  name                                                String
  type                                                String
  status                                              String                  @default("ACTIVE")
  statusReason                                        String?
  statusUpdatedAt                                     DateTime?
  createdAt                                           DateTime                @default(now())
  updatedAt                                           DateTime
  lastLogin                                           DateTime?
  verified                                            Boolean                 @default(false)
  application_templates                               application_templates[]
  business_profiles                                   business_profiles?
  campaign_applications                               campaign_applications[]
  campaign_likes                                      campaign_likes[]
  campaign_templates                                  campaign_templates[]
  campaigns                                           campaigns[]
  channels                                            channels?
  comments                                            comments[]
  files                                               files[]
  follows_follows_followerIdTousers                   follows[]               @relation("follows_followerIdTousers")
  follows_follows_followingIdTousers                  follows[]               @relation("follows_followingIdTousers")
  live_chat_messages                                  live_chat_messages[]
  notification_settings                               notification_settings?
  notifications                                       notifications[]
  payments                                            payments[]
  post_likes                                          post_likes[]
  posts                                               posts[]
  profiles                                            profiles?
  reports                                             reports[]
  saved_campaigns                                     saved_campaigns[]
  settlements                                         settlements[]
  subscriptions                                       subscriptions[]
  super_chats                                         super_chats[]
  video_comments                                      video_comments[]
  video_likes                                         video_likes[]
  watch_history                                       watch_history[]
  youtube_videos_youtube_videos_assignedUserIdTousers youtube_videos[]        @relation("youtube_videos_assignedUserIdTousers")
  youtube_videos_youtube_videos_importedByTousers     youtube_videos[]        @relation("youtube_videos_importedByTousers")
}

model video_comments {
  id                   String           @id
  videoId              String
  userId               String
  content              String
  parentId             String?
  likeCount            Int              @default(0)
  isPinned             Boolean          @default(false)
  isHearted            Boolean          @default(false)
  createdAt            DateTime         @default(now())
  updatedAt            DateTime
  video_comments       video_comments?  @relation("video_commentsTovideo_comments", fields: [parentId], references: [id])
  other_video_comments video_comments[] @relation("video_commentsTovideo_comments")
  users                users            @relation(fields: [userId], references: [id], onDelete: Cascade)
  campaigns            campaigns        @relation(fields: [videoId], references: [id], onDelete: Cascade)

  @@index([videoId])
}

model video_likes {
  id        String    @id
  videoId   String
  userId    String
  isLike    Boolean
  createdAt DateTime  @default(now())
  campaigns campaigns @relation(fields: [videoId], references: [id], onDelete: Cascade, map: "video_likes_campaign_fkey")
  users     users     @relation(fields: [userId], references: [id], onDelete: Cascade)
  videos    videos    @relation(fields: [videoId], references: [id], onDelete: Cascade, map: "video_likes_video_fkey")

  @@unique([videoId, userId])
}

model videos {
  id            String          @id
  channelId     String
  title         String
  description   String?
  thumbnailUrl  String
  videoUrl      String
  duration      Int
  viewCount     BigInt          @default(0)
  likeCount     Int             @default(0)
  dislikeCount  Int             @default(0)
  status        String          @default("processing")
  publishedAt   DateTime?
  tags          String?
  category      String?
  isShort       Boolean         @default(false)
  createdAt     DateTime        @default(now())
  updatedAt     DateTime
  super_chats   super_chats[]
  video_likes   video_likes[]
  channels      channels        @relation(fields: [channelId], references: [id], onDelete: Cascade)
  watch_history watch_history[]

  @@index([channelId])
  @@index([status])
}

model watch_history {
  id        String    @id
  userId    String
  videoId   String
  watchedAt DateTime  @default(now())
  watchTime Int       @default(0)
  completed Boolean   @default(false)
  campaigns campaigns @relation(fields: [videoId], references: [id], onDelete: Cascade, map: "watch_history_campaign_fkey")
  users     users     @relation(fields: [userId], references: [id], onDelete: Cascade)
  videos    videos    @relation(fields: [videoId], references: [id], onDelete: Cascade, map: "watch_history_video_fkey")

  @@unique([userId, videoId])
  @@index([userId])
}

model youtube_videos {
  id                                         String    @id
  youtubeId                                  String    @unique
  youtubeUrl                                 String
  title                                      String
  description                                String?
  thumbnailUrl                               String
  channelTitle                               String
  channelId                                  String?
  duration                                   String?
  viewCount                                  BigInt    @default(0)
  likeCount                                  Int       @default(0)
  commentCount                               Int       @default(0)
  publishedAt                                DateTime
  tags                                       String?
  category                                   String?
  embedHtml                                  String?
  assignedUserId                             String?
  assignedAt                                 DateTime?
  importedBy                                 String?
  importedAt                                 DateTime  @default(now())
  status                                     String    @default("imported")
  featured                                   Boolean   @default(false)
  displayOrder                               Int       @default(0)
  users_youtube_videos_assignedUserIdTousers users?    @relation("youtube_videos_assignedUserIdTousers", fields: [assignedUserId], references: [id])
  users_youtube_videos_importedByTousers     users?    @relation("youtube_videos_importedByTousers", fields: [importedBy], references: [id])

  @@index([assignedUserId])
  @@index([featured])
  @@index([status])
  @@index([youtubeId])
}

enum ApplicationStatus {
  PENDING
  APPROVED
  REJECTED
}

enum CampaignStatus {
  DRAFT
  ACTIVE
  PAUSED
  COMPLETED
}

enum PaymentStatus {
  PENDING
  COMPLETED
  FAILED
  CANCELLED
  PARTIAL_REFUNDED
  REFUNDED
}

enum UserType {
  ADMIN
  BUSINESS
  INFLUENCER
  CREATOR
  VIEWER
}
SCHEMA"
```

4. Install dependencies and setup Prisma:
```bash
podman exec video-platform-app sh -c "cd /app && npm install prisma @prisma/client"
podman exec video-platform-app sh -c "cd /app && npx prisma generate"
podman exec video-platform-app sh -c "cd /app && npx prisma db push --force-reset"
```

5. Build and start the application:
```bash
podman exec video-platform-app sh -c "cd /app && npm run build"
podman exec video-platform-app sh -c "cd /app && npm run start"
```

## Option 2: Direct Container Access

```bash
# Enter the container
podman exec -it video-platform-app sh

# Inside container:
cd /app
npm install prisma @prisma/client
# Create prisma/schema.prisma manually with vi or nano
npx prisma generate
npx prisma db push
npm run build
npm run start
```

## Files to deploy:
- Deployment package saved at: /tmp/video-platform-deploy.tar.gz
- Contains: Prisma schema, migrations, seed files

## Access URLs:
- Direct: http://141.164.60.51:4002
- Domain: https://video-platform.codeb.one-q.xyz (DNS required)
