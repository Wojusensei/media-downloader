package bilibili

// VideoInfo 是 /x/web-interface/view 解析后的视频信息。
type VideoInfo struct {
	BVID     string  `json:"bvid"`
	Title    string  `json:"title"`
	CID      int64   `json:"cid"`
	Cover    string  `json:"cover"`
	Duration int64   `json:"duration"`
	Owner    string  `json:"owner"`
	Pages    []Page  `json:"pages"`
	IsUpInteractive bool `json:"isUpInteractive"`
}

// Page 是多 P 视频的分 P 信息。
type Page struct {
	CID    int64  `json:"cid"`
	Index  int    `json:"index"`
	Title  string `json:"title"`
}

// Quality 是一个可选的画质档位。
type Quality struct {
	QN   int    `json:"qn"`
	Desc string `json:"desc"`
}

// AudioQuality 是一个可选的音质档位。
type AudioQuality struct {
	ID       int    `json:"id"`
	Desc     string `json:"desc"`
	Bandwidth int   `json:"bandwidth"`
}

// ParseResult 是 /api/parse 的返回结构。
type ParseResult struct {
	Video         VideoInfo      `json:"video"`
	Qualities     []Quality      `json:"qualities"`
	AudioQualities []AudioQuality `json:"audioQualities"`
	LoggedIn      bool           `json:"loggedIn"`
	VIP           bool           `json:"vip"`
	MaxGuestQN    int            `json:"maxGuestQn"`
}

// playURLData 对应 /x/player/playurl 的 data 字段（只保留用到的部分）。
type playURLData struct {
	AcceptQuality     []int    `json:"accept_quality"`
	AcceptDescription []string `json:"accept_description"`
	Timer             struct {
		IsVip bool `json:"is_vip"`
	} `json:"timer"`
	Durl []struct {
		URL  string `json:"url"`
		Size int64  `json:"size"`
	} `json:"durl"`
	Dash struct {
		Video []dashStream `json:"video"`
		Audio []dashStream `json:"audio"`
		Dolby struct {
			Audio []dashStream `json:"audio"`
		} `json:"dolby"`
		Flac *struct {
			Display bool       `json:"display"`
			Audio   *dashStream `json:"audio"`
		} `json:"flac"`
	} `json:"dash"`
}

type dashStream struct {
	ID        int    `json:"id"`
	BaseURL   string `json:"baseUrl"`
	BackupURL []string `json:"backupUrl"`
	Bandwidth int    `json:"bandwidth"`
	MimeType  string `json:"mimeType"`
	Codecs    string `json:"codecs"`
}

// viewData 对应 /x/web-interface/view 的 data 字段。
type viewData struct {
	BVID     string `json:"bvid"`
	Title    string `json:"title"`
	CID      int64  `json:"cid"`
	Pic      string `json:"pic"`
	Duration int64  `json:"duration"`
	Owner    struct {
		Name string `json:"name"`
	} `json:"owner"`
	Pages []struct {
		CID  int64  `json:"cid"`
		Page int    `json:"page"`
		Part string `json:"part"`
	} `json:"pages"`
	Rights struct {
		IsUpInteractive bool `json:"is_upower_exclusive"`
	} `json:"rights"`
}
