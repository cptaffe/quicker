import { VLIE, VLIEOffset } from "../../../../types/vlie";
import { Bignum } from "../../../../types/bignum";
import { Http3DataFrame, Http3CancelPushFrame, Http3GoAwayFrame, Http3MaxPushIDFrame, Http3DuplicatePushFrame, Http3SettingsFrame } from "../frames";
import { Http3PriorityFrame } from "../frames/http3.priorityframe";
import { Http3HeaderFrame } from "../frames/http3.headerframe";
import { Http3Error, Http3ErrorCode } from "../errors/http3.error";
import { Http3BaseFrame, Http3FrameType } from "../frames/http3.baseframe";
import { Http3QPackEncoder } from "../qpack/http3.qpackencoder";
import { Http3QPackDecoder } from "../qpack/http3.qpackdecoder";

export class Http3FrameParser {
    private encoder?: Http3QPackEncoder;
    private decoder?: Http3QPackDecoder;
    
    public constructor(encoder?: Http3QPackEncoder, decoder?: Http3QPackDecoder) {
        this.encoder = encoder;
        this.decoder = decoder;
    }
    
    /**
     * Parses a buffer and tries to form an Http3Frame object from it
     * Returns undefined if invalid
     * @param buffer A buffer object containing the frame
     * @param bufferOffset The offset within the buffer where the frame starts at
     */
    public parse(buffer: Buffer, streamID: Bignum, bufferOffset: number = 0): [Http3BaseFrame[], number] {
        let frames: Http3BaseFrame[] = [];
        let offset: number = bufferOffset;
        let parsedOffset = offset;

        // TODO catch error out of range and return all completely parsed frames and parsedOffset
        while(offset < buffer.byteLength) {
            // TODO Safety checks before parsing to make sure format is valid
            let lengthVlie: VLIEOffset = VLIE.decode(buffer, bufferOffset);
            let length: Bignum = lengthVlie.value;
            offset = lengthVlie.offset;

            // let frameType: number = buffer.readUInt8(offset++);
            const frameTypeVlie: VLIEOffset = VLIE.decode(buffer, offset);
            const frameType: Bignum = frameTypeVlie.value;
            offset = frameTypeVlie.offset;
            let frameTypeEnum: Http3FrameType | undefined = Http3FrameParser.toFrameType(frameType);
            if (frameTypeEnum === undefined) {
                throw new Http3Error(Http3ErrorCode.HTTP3_MALFORMED_FRAME);
            }

            // TODO From offset to offset + length BUT length is bignum
            // Risk downcast to number?
            let payload: Buffer = buffer.slice(offset, offset + length.toNumber());
            offset += length.toNumber();

            switch(frameTypeEnum) {
                case Http3FrameType.DATA:
                    frames.push(new Http3DataFrame(payload));
                    break;
                case Http3FrameType.HEADERS:
                    if (this.encoder === undefined || this.decoder === undefined) {
                        throw new Http3Error(Http3ErrorCode.HTTP3_UNINITIALISED_DECODER, "HTTP/3 Frame parser encountered a header frame before decoder was initialised!");
                    }
                    frames.push(Http3HeaderFrame.fromPayload(payload, streamID, this.encoder, this.decoder));
                    break;
                case Http3FrameType.PRIORITY:
                    frames.push(new Http3PriorityFrame(payload));
                    break;
                case Http3FrameType.CANCEL_PUSH:
                    frames.push(new Http3CancelPushFrame(payload));
                    break;
                case Http3FrameType.SETTINGS:
                    const settingsFrame: Http3SettingsFrame = Http3SettingsFrame.fromPayload(payload);
                    frames.push(settingsFrame);
                case Http3FrameType.GOAWAY:
                    const goAwayFrame: Http3GoAwayFrame = Http3GoAwayFrame.fromPayload(payload);
                    frames.push(goAwayFrame);
                    break;
                case Http3FrameType.MAX_PUSH_ID:
                    frames.push(new Http3MaxPushIDFrame(payload));
                    break;
                case Http3FrameType.DUPLICATE_PUSH:
                    frames.push(new Http3DuplicatePushFrame(payload));
                    break;
                default:
                    throw new Http3Error(Http3ErrorCode.HTTP3_UNKNOWN_FRAMETYPE, "Unknown frametype encountered while parsing http3 frames");
            }
            parsedOffset = offset;
        }
        
        return [frames, parsedOffset];
    }
    
    public setEncoder(encoder: Http3QPackEncoder) {
        this.encoder = encoder;
    }
    
    public setDecoder(decoder: Http3QPackDecoder) {
        this.decoder = decoder;
    }

    /**
     * Converts the given frametype to a value of enum Http3FrameType
     * If value doesn't match with any known frametype, it returns undefined
     * @param frameType A frametype as a number
     * @returns A value of type Http3FrameType if valid, undefined otherwise
     */
    private static toFrameType(frameType: Bignum): Http3FrameType | undefined {
        const ft: number = frameType.toNumber();
        switch(ft) {
            case Http3FrameType.DATA:
            case Http3FrameType.HEADERS:
            case Http3FrameType.PRIORITY:
            case Http3FrameType.CANCEL_PUSH:
            case Http3FrameType.SETTINGS:
            case Http3FrameType.PUSH_PROMISE:
            case Http3FrameType.GOAWAY:
            case Http3FrameType.MAX_PUSH_ID:
            case Http3FrameType.DUPLICATE_PUSH:
                return ft as Http3FrameType;
            default:
                if (Http3FrameParser.isReservedFrameType(frameType) == true) {
                    return Http3FrameType.RESERVED;
                } else {
                    return undefined;
                }
        }
    }

    private static isReservedFrameType(frameType: Bignum): boolean {
        // Check if frametype is of format "0x1f * N + 0x21"
        return (frameType.subtract(0x21).modulo(0x1f).equals(new Bignum(0))); 
    }
}