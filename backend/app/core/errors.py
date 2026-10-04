class WorkflowError(Exception):
    def __init__(self, status: int, detail: str, *, case_id: str | None = None,
                 action: str = "request", rule: str = "VALID_STATE_REQUIRED",
                 truth_label: str = "REAL_HUMAN_INPUT"):
        super().__init__(detail)
        self.status = status
        self.detail = detail
        self.case_id = case_id
        self.action = action
        self.rule = rule
        self.truth_label = truth_label
