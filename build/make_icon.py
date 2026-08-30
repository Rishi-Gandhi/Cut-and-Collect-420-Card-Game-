from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# felt-green rounded-square background, matching the game's table felt
bg_margin = 24
draw.rounded_rectangle(
    [bg_margin, bg_margin, SIZE - bg_margin, SIZE - bg_margin],
    radius=200,
    fill=(18, 60, 46, 255),  # #123C2E
    outline=(201, 162, 75, 255),  # #C9A24B brass
    width=14,
)

# the card itself, centered, matching the in-game CardFace look
card_w, card_h = 560, 780
card_x0 = (SIZE - card_w) // 2
card_y0 = (SIZE - card_h) // 2
card_x1 = card_x0 + card_w
card_y1 = card_y0 + card_h

# soft drop shadow
shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
sdraw = ImageDraw.Draw(shadow)
sdraw.rounded_rectangle(
    [card_x0 + 18, card_y0 + 26, card_x1 + 18, card_y1 + 26],
    radius=48,
    fill=(0, 0, 0, 130),
)
shadow = shadow.filter(__import__("PIL.ImageFilter", fromlist=["GaussianBlur"]).GaussianBlur(20))
img = Image.alpha_composite(img, shadow)
draw = ImageDraw.Draw(img)

draw.rounded_rectangle(
    [card_x0, card_y0, card_x1, card_y1],
    radius=48,
    fill=(245, 239, 217, 255),  # #F5EFD9 cream
    outline=(201, 162, 75, 255),  # #C9A24B brass
    width=10,
)

black = (28, 33, 24, 255)  # #1c2118

font_big = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 220)
font_corner = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 84)
font_suit_center = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 300)
font_suit_corner = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 76)

SPADE = "♠"


def center_text(d, xy, text, font, fill):
    bbox = d.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((xy[0] - w / 2 - bbox[0], xy[1] - h / 2 - bbox[1]), text, font=font, fill=fill)


# center suit symbol (behind the big rank number, like a watermark)
center_text(draw, (card_x0 + card_w / 2, card_y0 + card_h / 2 + 40), SPADE, font_suit_center, (28, 33, 24, 60))

# big centered "10"
center_text(draw, (card_x0 + card_w / 2, card_y0 + card_h / 2 - 60), "10", font_big, black)

# corner pips (top-left and bottom-right, like a real card)
pad_x, pad_y = 44, 40
draw.text((card_x0 + pad_x, card_y0 + pad_y), "10", font=font_corner, fill=black)
draw.text((card_x0 + pad_x, card_y0 + pad_y + 92), SPADE, font=font_suit_corner, fill=black)

br_text = "10"
bbox = draw.textbbox((0, 0), br_text, font=font_corner)
w = bbox[2] - bbox[0]
draw.text((card_x1 - pad_x - w, card_y1 - pad_y - 92 - (bbox[3] - bbox[1]) - 10), SPADE, font=font_suit_corner, fill=black)
bbox2 = draw.textbbox((0, 0), SPADE, font=font_suit_corner)
draw.text((card_x1 - pad_x - w, card_y1 - pad_y - (bbox[3] - bbox[1]) - 10), br_text, font=font_corner, fill=black)

img.save("/Users/rishigandhi/VSCodeProjects/420 card game/build/icon.png")
print("saved", img.size)
