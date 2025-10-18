# CI/CD Pipeline Setup

- Use GitHub Actions or GitLab CI for automated testing and deployment
- Steps:
  - Install dependencies
  - Run unit and integration tests
  - Build Docker image
  - Push image to registry
  - Deploy to staging/production
- Example workflow:
  - .github/workflows/ci.yml
  - .gitlab-ci.yml
