```mermaid
stateDiagram-v2
  [*] --> PlaceExists

  state PlaceExists {
    [*] --> LevelUnverified : source=osm/import
    LevelUnverified --> LevelDirectory : curated directory import / manual upgrade
    LevelUnverified --> LevelCommunity : community verified
    LevelUnverified --> LevelOwner : owner verified

    LevelDirectory --> LevelCommunity
    LevelDirectory --> LevelOwner
    LevelCommunity --> LevelOwner

    %% downgrade / correction
    LevelOwner --> LevelCommunity : revoke / correction
    LevelCommunity --> LevelUnverified : revoke / correction
    LevelDirectory --> LevelUnverified : correction
  }
```
