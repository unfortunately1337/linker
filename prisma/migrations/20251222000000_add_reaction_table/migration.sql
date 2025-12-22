-- CreateTable Reaction
CREATE TABLE Reaction (
    id VARCHAR(191) NOT NULL,
    messageId VARCHAR(191) NOT NULL,
    userId VARCHAR(191) NOT NULL,
    emoji VARCHAR(191) NOT NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE KEY Reaction_messageId_userId_emoji_key(messageId, userId, emoji),
    CONSTRAINT Reaction_messageId_fkey FOREIGN KEY (messageId) REFERENCES Message(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT Reaction_userId_fkey FOREIGN KEY (userId) REFERENCES User(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY (id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
