package bilibili

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
)

// LoginStatus 描述当前 Cookie 的登录状态。
type LoginStatus struct {
	LoggedIn   bool   `json:"loggedIn"`
	VIP        bool   `json:"vip"`
	Username   string `json:"username"`
	Avatar     string `json:"avatar"`
	Mid        int64  `json:"mid"`
}

type navData struct {
	IsLogin  bool `json:"isLogin"`
	Mid      int64 `json:"mid"`
	Uname    string `json:"uname"`
	Face     string `json:"face"`
	VipStatus int  `json:"vipStatus"`
}

// CheckLogin 用 nav 接口校验 Cookie 是否有效，并返回大会员状态。
func (c *Client) CheckLogin(ctx context.Context) (*LoginStatus, error) {
	body, err := c.getRawJSON(ctx, "https://api.bilibili.com/x/web-interface/nav", url.Values{})
	if err != nil {
		return nil, err
	}
	var d navData
	if err := json.Unmarshal(body, &d); err != nil {
		return nil, fmt.Errorf("解析登录信息失败: %w", err)
	}
	return &LoginStatus{
		LoggedIn: d.IsLogin,
		VIP:      d.VipStatus == 1,
		Username: d.Uname,
		Avatar:   d.Face,
		Mid:      d.Mid,
	}, nil
}

// getRawJSON 请求并返回 data 字段的原始 JSON。
func (c *Client) getRawJSON(ctx context.Context, api string, query url.Values) (json.RawMessage, error) {
	var raw json.RawMessage
	if err := c.getJSON(ctx, api, query, &raw); err != nil {
		return nil, err
	}
	return raw, nil
}
