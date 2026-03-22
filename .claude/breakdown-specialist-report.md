status: pass
summary: Broke feature ae8d42f7 into 3 jobs covering data layer, FeatureDetailPanel badges, and JobDetailExpand error section
jobs_created: 3
dependency_depth: 2

## Jobs

1. **Add error_analysis to job queries and TypeScript interfaces** (3bb1230d)
   - complexity: simple
   - depends_on: []
   - Adds ErrorAnalysis type, updates FeatureDetailJob + JobDetail interfaces, adds error_analysis to fetchFeatureDetail select clause

2. **Add error count badges to job rows in FeatureDetailPanel** (9a544dea)
   - complexity: medium
   - depends_on: [3bb1230d]
   - Renders red/yellow badge on job rows with error count

3. **Add error_analysis section to JobDetailExpand view** (765c5b03)
   - complexity: medium
   - depends_on: [3bb1230d]
   - Renders collapsible Errors section above Result Summary with per-error cards, severity badges, and snippet truncation

## Dependency Graph

```
3bb1230d (data layer)
    ├── 9a544dea (FeatureDetailPanel badges)
    └── 765c5b03 (JobDetailExpand error section)
```

Max dependency chain: 2
