# T012 calculation re-audit

Decision: rejected. The earlier same-product, demand uncertainty, and date defects are fixed. One final edge remains: optional ingredient lines can claim shared stock before required lines, and the service query does not explicitly order group/ingredient/ID rows. T013 makes allocation required-first while preserving the original output order and adds stable repeated-read coverage.
